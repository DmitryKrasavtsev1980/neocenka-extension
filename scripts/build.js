#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Конфигурация
const CONFIG = {
    extensionName: 'neocenka-extension',
    buildDir: 'dist',
    sourceDir: '.',
    excludeFiles: [
        '.git',
        '.github',
        'node_modules',
        'dist',
        'scripts',
        'tests',
        'example',
        '.gitignore',
        '.claude',
        'test_*.js',
        'debug_*.html',
        'debug-toggle.js'
    ]
};

// Функция для создания директории
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Функция для копирования файлов
function copyFiles(src, dest, excludeList = []) {
    ensureDir(dest);
    
    const items = fs.readdirSync(src);
    
    items.forEach(item => {
        // Проверяем исключения
        if (excludeList.some(exclude => {
            if (exclude.includes('*')) {
                // Поддержка wildcards
                const pattern = exclude.replace(/\*/g, '.*');
                return new RegExp(pattern).test(item);
            }
            return item === exclude;
        })) {
            return;
        }
        
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
            copyFiles(srcPath, destPath, excludeList);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// Функция для получения версии из package.json
function getVersion() {
    const packagePath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version;
    }
    return '1.0.0';
}

// Функция для обновления версии в manifest.json
function updateManifestVersion(buildDir, version) {
    const manifestPath = path.join(buildDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.version = version;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`✓ Версия в manifest.json обновлена до ${version}`);
    }
}

// Функция для создания ZIP архива
function createZipArchive(buildDir, outputName) {
    try {
        const zipPath = path.join(process.cwd(), `${outputName}.zip`);
        
        // Удаляем существующий архив если есть
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        
        // Создаем ZIP архив
        execSync(`cd ${buildDir} && zip -r ../${outputName}.zip . -x "*.git*" "node_modules/*" "dist/*"`, 
                { stdio: 'inherit' });
        
        console.log(`✓ ZIP архив создан: ${outputName}.zip`);
        return zipPath;
    } catch (error) {
        console.error('Ошибка при создании ZIP архива:', error);
        throw error;
    }
}

// Функция для создания CRX файла (требует Chrome)
function createCrxFile(buildDir, outputName) {
    try {
        // Проверяем наличие Chrome
        const chromePath = process.platform === 'win32' 
            ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : '/usr/bin/google-chrome';
            
        if (!fs.existsSync(chromePath)) {
            console.log('⚠ Chrome не найден, пропускаем создание CRX файла');
            return null;
        }
        
        const crxPath = path.join(process.cwd(), `${outputName}.crx`);
        const keyPath = path.join(process.cwd(), 'private-key.pem');
        
        // Создаем приватный ключ если не существует
        if (!fs.existsSync(keyPath)) {
            console.log('⚠ Приватный ключ не найден, создаем новый...');
            execSync(`openssl genrsa -out ${keyPath} 2048`, { stdio: 'inherit' });
        }
        
        // Создаем CRX файл
        execSync(`${chromePath} --pack-extension=${buildDir} --pack-extension-key=${keyPath}`, 
                { stdio: 'inherit' });
        
        console.log(`✓ CRX файл создан: ${outputName}.crx`);
        return crxPath;
    } catch (error) {
        console.log('⚠ Не удалось создать CRX файл:', error.message);
        return null;
    }
}

// Функция для создания updates.xml
function createUpdatesXml(version) {
    const updatesXml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="neocenka-extension">
    <updatecheck codebase="https://github.com/DmitryKrasavtsev1980/neocenka-extension/releases/download/v${version}/neocenka-extension-${version}.zip" version="${version}" />
  </app>
</gupdate>`;
    
    fs.writeFileSync('updates.xml', updatesXml);
    console.log(`✓ updates.xml обновлен для версии ${version}`);
}

// Основная функция сборки
async function build() {
    console.log('🚀 Начинаем сборку расширения...');
    
    try {
        // Получаем версию
        const version = getVersion();
        console.log(`📦 Версия: ${version}`);
        
        // Очищаем директорию сборки
        const buildDir = path.join(process.cwd(), CONFIG.buildDir);
        if (fs.existsSync(buildDir)) {
            fs.rmSync(buildDir, { recursive: true, force: true });
        }
        
        // Создаем директорию сборки
        ensureDir(buildDir);
        
        // Копируем файлы
        console.log('📂 Копируем файлы...');
        copyFiles(CONFIG.sourceDir, buildDir, CONFIG.excludeFiles);
        
        // Обновляем версию в manifest.json
        updateManifestVersion(buildDir, version);
        
        // Собираем CSS если есть Tailwind
        try {
            console.log('🎨 Собираем CSS...');
            execSync('npm run build', { stdio: 'inherit' });
        } catch (error) {
            console.log('⚠ Не удалось собрать CSS:', error.message);
        }
        
        // Создаем архивы
        const outputName = `${CONFIG.extensionName}-${version}`;
        
        console.log('📦 Создаем архивы...');
        const zipPath = createZipArchive(buildDir, outputName);
        const crxPath = createCrxFile(buildDir, outputName);
        
        // Создаем updates.xml
        createUpdatesXml(version);
        
        // Выводим результат
        console.log('\n✅ Сборка завершена!');
        console.log(`📁 Директория сборки: ${buildDir}`);
        console.log(`📦 ZIP архив: ${path.basename(zipPath)}`);
        if (crxPath) {
            console.log(`📦 CRX файл: ${path.basename(crxPath)}`);
        }
        console.log(`📄 updates.xml обновлен`);
        
    } catch (error) {
        console.error('❌ Ошибка при сборке:', error);
        process.exit(1);
    }
}

// Запускаем сборку
if (require.main === module) {
    build();
}

module.exports = { build };