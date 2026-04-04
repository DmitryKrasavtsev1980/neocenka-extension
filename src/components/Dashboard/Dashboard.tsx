import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  ComposedChart,
} from 'recharts';
import { Deal } from '@/types';
import {
  REAL_ESTATE_TYPES,
  DOCUMENT_TYPES,
  getRealEstateTypeName,
  getWallMaterialName,
} from '@/constants/catalogs';
import './Dashboard.css';

interface DashboardProps {
  deals: Deal[];
  totalDeals: number;
}

const COLORS = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#00bcd4', '#ff5722', '#795548'];

const Dashboard: React.FC<DashboardProps> = ({ deals, totalDeals }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Аналитические данные
  const analytics = useMemo(() => {
    console.log('[Dashboard] Computing analytics, deals:', deals.length, 'totalDeals:', totalDeals);

    if (deals.length === 0) {
      return {
        byType: [],
        byDocType: [],
        byWallMaterial: [],
        byQuarter: [],
        priceRange: { min: 0, max: 0, avg: 0, median: 0 },
        areaRange: { min: 0, max: 0, avg: 0 },
        topRegions: [],
        totalSum: 0,
        count: 0,
        totalCount: totalDeals,
      };
    }

    // Группировка по типу объекта
    const typeGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      const name = getRealEstateTypeName(deal.realestate_type_code);
      typeGroups[name] = (typeGroups[name] || 0) + 1;
    });
    const byType = Object.entries(typeGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Группировка по типу документа
    const docTypeGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      const name = DOCUMENT_TYPES[deal.doc_type] || deal.doc_type;
      docTypeGroups[name] = (docTypeGroups[name] || 0) + 1;
    });
    const byDocType = Object.entries(docTypeGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Группировка по материалу стен
    const wallMaterialGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      if (deal.wall_material_code) {
        const name = getWallMaterialName(deal.wall_material_code);
        wallMaterialGroups[name] = (wallMaterialGroups[name] || 0) + 1;
      }
    });
    const byWallMaterial = Object.entries(wallMaterialGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Группировка по кварталам с ценой
    const quarterGroups: Record<string, { count: number; sum: number; prices: number[]; pricePerMeters: number[] }> = {};
    deals.forEach((deal) => {
      if (!quarterGroups[deal.year_quarter]) {
        quarterGroups[deal.year_quarter] = { count: 0, sum: 0, prices: [], pricePerMeters: [] };
      }
      quarterGroups[deal.year_quarter].count += deal.number || 1;
      quarterGroups[deal.year_quarter].sum += deal.deal_price;
      quarterGroups[deal.year_quarter].prices.push(deal.deal_price);
      // Цена за квадратный метр
      if (deal.area > 0) {
        quarterGroups[deal.year_quarter].pricePerMeters.push(deal.deal_price / deal.area);
      }
    });

    const byQuarter = Object.entries(quarterGroups)
      .map(([name, data]) => {
        const avgPrice = data.prices.length > 0
          ? Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length)
          : 0;
        const avgPricePerMeter = data.pricePerMeters.length > 0
          ? Math.round(data.pricePerMeters.reduce((a, b) => a + b, 0) / data.pricePerMeters.length)
          : 0;
        return {
          name: name.replace('-Q', ' Q'),
          sortKey: name, // для сортировки
          count: data.count,
          sum: data.sum,
          avgPrice,
          avgPricePerMeter,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    console.log('[Dashboard] byQuarter data:', byQuarter);

    // Ценовой диапазон
    const prices = deals.map((d) => d.deal_price).filter((p) => p > 0).sort((a, b) => a - b);
    const priceRange = {
      min: prices[0] || 0,
      max: prices[prices.length - 1] || 0,
      avg: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      median: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0,
    };

    // Площадь
    const areas = deals.map((d) => d.area).filter((a) => a > 0);
    const areaRange = {
      min: areas.length > 0 ? Math.min(...areas) : 0,
      max: areas.length > 0 ? Math.max(...areas) : 0,
      avg: areas.length > 0 ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0,
    };

    // Топ регионов
    const regionGroups: Record<string, number> = {};
    deals.forEach((deal) => {
      if (deal.region_code) {
        regionGroups[deal.region_code] = (regionGroups[deal.region_code] || 0) + 1;
      }
    });
    const topRegions = Object.entries(regionGroups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const totalSum = deals.reduce((acc, d) => acc + d.deal_price, 0);

    return {
      byType,
      byDocType,
      byWallMaterial,
      byQuarter,
      priceRange,
      areaRange,
      topRegions,
      totalSum,
      count: deals.length,
      totalCount: totalDeals,
    };
  }, [deals, totalDeals]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)} млрд`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)} млн`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)} тыс`;
    }
    return num.toLocaleString('ru-RU');
  };

  const formatPrice = (price: number): string => {
    return `${formatNumber(price)} ₽`;
  };

  if (deals.length === 0) {
    return null;
  }

  return (
    <div className={`dashboard ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="dashboard-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h2>📊 Аналитика</h2>
        <div className="dashboard-toggle">
          <span>{isExpanded ? 'Свернуть' : 'Развернуть'}</span>
          <span className="toggle-icon">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Ключевые метрики - всегда видны */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-value">{formatNumber(analytics.totalCount)}</div>
          <div className="metric-label">Сделок</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatPrice(analytics.totalSum)}</div>
          <div className="metric-label">Общая сумма</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatPrice(analytics.priceRange.avg)}</div>
          <div className="metric-label">Средняя цена</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatPrice(analytics.priceRange.median)}</div>
          <div className="metric-label">Медианная цена</div>
        </div>
      </div>

      {isExpanded && (
        <div className="dashboard-content">
          {/* Графики */}
          <div className="charts-grid">
            {/* Динамика по кварталам - количество сделок */}
            <div className="chart-card chart-wide">
              <h3>Динамика сделок по периодам</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={analytics.byQuarter}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                    itemStyle={{ color: '#333' }}
                    labelStyle={{ color: '#333', fontWeight: 'bold' }}
                    formatter={(value: number) => formatNumber(value)}
                    labelFormatter={(label) => `Период: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Кол-во сделок"
                    stroke="#1a73e8"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Динамика средней цены по периодам */}
            <div className="chart-card chart-wide">
              <h3>Динамика средней цены по периодам</h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={analytics.byQuarter}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                    itemStyle={{ color: '#333' }}
                    labelStyle={{ color: '#333', fontWeight: 'bold' }}
                    formatter={(value: number, name: string) => {
                      if (name === 'Средняя цена') return formatPrice(value);
                      if (name === 'Цена за м²') return `${formatNumber(value)} ₽/м²`;
                      return formatNumber(value);
                    }}
                    labelFormatter={(label) => `Период: ${label}`}
                  />
                  <Legend />
                  <Bar
                    yAxisId="right"
                    dataKey="count"
                    name="Кол-во сделок"
                    fill="#e8f0fe"
                    barSize={20}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="avgPrice"
                    name="Средняя цена"
                    stroke="#34a853"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#34a853' }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="avgPricePerMeter"
                    name="Цена за м²"
                    stroke="#ea4335"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#ea4335' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Распределение по типам объектов */}
            <div className="chart-card">
              <h3>По типу объекта</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.byType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name.substring(0, 10)}... (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analytics.byType.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* По типу документа */}
            <div className="chart-card">
              <h3>По типу договора</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.byDocType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analytics.byDocType.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* По материалу стен */}
            <div className="chart-card">
              <h3>По материалу стен</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={analytics.byWallMaterial}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name.substring(0, 8)}... (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analytics.byWallMaterial.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Топ регионов */}
            <div className="chart-card chart-wide">
              <h3>Топ-10 регионов по количеству сделок</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.topRegions} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Bar dataKey="value" name="Сделок" fill="#1a73e8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Дополнительные метрики */}
          <div className="additional-metrics">
            <div className="metric-group">
              <h4>Ценовой диапазон</h4>
              <div className="metric-items">
                <div className="metric-item">
                  <span className="label">Мин:</span>
                  <span className="value">{formatPrice(analytics.priceRange.min)}</span>
                </div>
                <div className="metric-item">
                  <span className="label">Макс:</span>
                  <span className="value">{formatPrice(analytics.priceRange.max)}</span>
                </div>
              </div>
            </div>
            <div className="metric-group">
              <h4>Площадь (м²)</h4>
              <div className="metric-items">
                <div className="metric-item">
                  <span className="label">Мин:</span>
                  <span className="value">{analytics.areaRange.min.toLocaleString('ru-RU')}</span>
                </div>
                <div className="metric-item">
                  <span className="label">Макс:</span>
                  <span className="value">{analytics.areaRange.max.toLocaleString('ru-RU')}</span>
                </div>
                <div className="metric-item">
                  <span className="label">Средняя:</span>
                  <span className="value">{analytics.areaRange.avg.toLocaleString('ru-RU')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
