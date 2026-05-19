/**
 * Умный алгоритм сопоставления адресов
 * Порт из neocenka-extension/utils/smart-address-matcher.js
 *
 * 5-этапный алгоритм: obvious → exact_geo → smart_near → ml_extended → fuzzy_global
 * Композитный скор: geo(0.20) + text(0.35) + semantic(0.25) + structural(0.15) + fuzzy(0.05)
 */

import type { Ad, AdAddress } from '@/types';

// ========== Типы ==========

export interface MatchResult {
  address: AdAddress | null;
  confidence: 'perfect' | 'high' | 'medium' | 'low' | 'very_low' | 'none';
  method: string;
  distance: number | null;
  score: number;
  textSimilarity: number;
  semanticSimilarity: number;
  structuralSimilarity: number;
  fuzzyScore: number;
}

interface PreprocessedAddress {
  original: string;
  normalized: string;
  components: AddressComponents;
  tokens: string[];
}

interface AddressComponents {
  street: string | null;
  houseNumber: string | null;
  building: string | null;
  direction: string | null;
}

interface CandidateResult {
  address: AdAddress;
  distance: number;
  score: number;
  textSimilarity: number;
  semanticSimilarity: number;
  structuralSimilarity: number;
  fuzzyScore: number;
  method: string;
  confidence?: string;
}

// ========== Класс ==========

export class SmartAddressMatcher {
  private model = {
    radii: {
      precise: 20,
      exact: 25,
      near: 75,
      extended: 200,
      far: 500,
    },
    thresholds: {
      perfect: 0.90,
      excellent: 0.75,
      good: 0.60,
      acceptable: 0.45,
      minimal: 0.30,
    },
    weights: {
      geospatial: 0.20,
      textual: 0.35,
      semantic: 0.25,
      structural: 0.15,
      fuzzy: 0.05,
    },
  };

  private normalizationMaps = this.buildNormalizationMaps();
  private obviousPatterns = this.buildObviousPatterns();

  // ========== Главный метод ==========

  matchAddressSmart(ad: Ad, addresses: AdAddress[]): MatchResult {
    const coords = this.normalizeCoordinates(ad.coordinates.lat, ad.coordinates.lng);
    const addressData = this.preprocessAddress(ad.address || '');

    let bestMatch: CandidateResult | null = null;
    let matchMethod = 'no_match';

    // Этап 0: Очевидные совпадения (200м, агрессивная нормализация)
    bestMatch = this.tryObviousMatch(coords, addresses, addressData);
    if (bestMatch) {
      matchMethod = 'obvious_match';
      bestMatch.confidence = 'high';
    }

    // Этап 1: Точное географическое совпадение (25м, ровно 1 адрес)
    if (!bestMatch) {
      bestMatch = this.tryExactGeoMatch(coords, addresses);
      if (bestMatch) {
        matchMethod = 'exact_geo_smart';
        bestMatch.confidence = 'high';
      }
    }

    // Этап 2: Умный ближний поиск (75м, композитный скор)
    if (!bestMatch) {
      bestMatch = this.trySmartNearMatch(coords, addresses, addressData);
      if (bestMatch) {
        matchMethod = 'smart_near_geo';
        bestMatch.confidence = bestMatch.score >= this.model.thresholds.excellent ? 'high' : 'medium';
      }
    }

    // Этап 3: ML-расширенный поиск (200м)
    if (!bestMatch) {
      bestMatch = this.tryMLExtendedMatch(coords, addresses, addressData);
      if (bestMatch) {
        matchMethod = 'ml_extended_geo';
        bestMatch.confidence = this.getConfidenceLevel(bestMatch.score);
      }
    }

    // Этап 4: Глобальный нечеткий поиск (500м)
    if (!bestMatch) {
      bestMatch = this.tryFuzzyGlobalMatch(coords, addresses, addressData);
      if (bestMatch) {
        matchMethod = 'fuzzy_global';
        bestMatch.confidence = this.getConfidenceLevel(bestMatch.score);
      }
    }

    return {
      address: bestMatch?.address || null,
      confidence: bestMatch?.confidence || 'none',
      method: matchMethod,
      distance: bestMatch?.distance ?? null,
      score: bestMatch?.score ?? 0,
      textSimilarity: bestMatch?.textSimilarity ?? 0,
      semanticSimilarity: bestMatch?.semanticSimilarity ?? 0,
      structuralSimilarity: bestMatch?.structuralSimilarity ?? 0,
      fuzzyScore: bestMatch?.fuzzyScore ?? 0,
    };
  }

  // ========== Этапы сопоставления ==========

  /** Этап 0: Очевидные совпадения с агрессивной нормализацией */
  private tryObviousMatch(
    coords: { lat: number; lng: number } | null,
    addresses: AdAddress[],
    addressData: PreprocessedAddress,
  ): CandidateResult | null {
    if (!coords) return null;

    const aggressiveNormalized = this.aggressiveNormalize(addressData.original);
    const candidates = this.getAddressesInRadius(addresses, coords, 200);

    let bestMatch: CandidateResult | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const candidateNormalized = this.aggressiveNormalize(candidate.address || '');
      const obviousScore = this.calculateObviousScore(aggressiveNormalized, candidateNormalized);

      if (obviousScore >= 0.9 && obviousScore > bestScore) {
        bestScore = obviousScore;
        const result: CandidateResult = {
          address: candidate,
          distance: this.calculateDistance(coords, candidate.coordinates),
          score: obviousScore,
          textSimilarity: obviousScore,
          semanticSimilarity: 0,
          structuralSimilarity: 0,
          fuzzyScore: 0,
          method: 'obvious_aggressive',
        };
        bestMatch = this.applyProximityRule(result, coords);
      }
    }

    return bestMatch;
  }

  /** Этап 1: Точное географическое совпадение (25м, ровно 1 кандидат) */
  private tryExactGeoMatch(
    coords: { lat: number; lng: number } | null,
    addresses: AdAddress[],
  ): CandidateResult | null {
    if (!coords) return null;

    const nearby = this.getAddressesInRadius(addresses, coords, this.model.radii.exact);

    if (nearby.length === 1) {
      const candidate = nearby[0];
      const result: CandidateResult = {
        address: candidate,
        distance: this.calculateDistance(coords, candidate.coordinates),
        score: 1.0,
        textSimilarity: 1.0,
        semanticSimilarity: 1.0,
        structuralSimilarity: 1.0,
        fuzzyScore: 1.0,
        method: 'exact_geo',
      };
      return this.applyProximityRule(result, coords);
    }

    return null;
  }

  /** Этап 2: Умный ближний поиск (75м, композитный скор) */
  private trySmartNearMatch(
    coords: { lat: number; lng: number } | null,
    addresses: AdAddress[],
    addressData: PreprocessedAddress,
  ): CandidateResult | null {
    if (!coords) return null;

    const nearby = this.getAddressesInRadius(addresses, coords, this.model.radii.near);
    if (nearby.length === 0) return null;

    let bestMatch: CandidateResult | null = null;
    let bestScore = 0;

    for (const candidate of nearby) {
      const candidateData = this.preprocessAddress(candidate.address || '');
      const score = this.calculateCompositeScore(
        addressData, candidateData,
        coords, candidate.coordinates,
      );

      if (score > bestScore && score >= this.model.thresholds.acceptable) {
        bestScore = score;
        const result: CandidateResult = {
          address: candidate,
          distance: this.calculateDistance(coords, candidate.coordinates),
          score,
          textSimilarity: this.calculateAdvancedTextSimilarity(addressData.normalized, candidateData.normalized),
          semanticSimilarity: this.calculateSemanticSimilarity(addressData.components, candidateData.components),
          structuralSimilarity: this.calculateStructuralSimilarity(addressData.tokens, candidateData.tokens),
          fuzzyScore: this.calculateFuzzySimilarity(addressData.normalized, candidateData.normalized),
          method: 'smart_near',
        };
        bestMatch = this.applyProximityRule(result, coords);
      }
    }

    return bestMatch;
  }

  /** Этап 3: ML-расширенный поиск (200м) */
  private tryMLExtendedMatch(
    coords: { lat: number; lng: number } | null,
    addresses: AdAddress[],
    addressData: PreprocessedAddress,
  ): CandidateResult | null {
    if (!coords) return null;

    const extended = this.getAddressesInRadius(addresses, coords, this.model.radii.extended);
    if (extended.length === 0) return null;

    // Ранжирование кандидатов
    const ranked = this.rankCandidates(addressData, extended, coords);
    const top = ranked[0];

    if (top && top.score >= this.model.thresholds.minimal) {
      const result: CandidateResult = {
        address: top.address,
        distance: top.distance,
        score: top.score,
        textSimilarity: top.textSimilarity,
        semanticSimilarity: top.semanticSimilarity,
        structuralSimilarity: top.structuralSimilarity,
        fuzzyScore: top.fuzzyScore,
        method: 'ml_extended',
      };
      return this.applyProximityRule(result, coords);
    }

    return null;
  }

  /** Этап 4: Глобальный нечеткий поиск (500м) */
  private tryFuzzyGlobalMatch(
    coords: { lat: number; lng: number } | null,
    addresses: AdAddress[],
    addressData: PreprocessedAddress,
  ): CandidateResult | null {
    if (!coords) return null;

    const far = this.getAddressesInRadius(addresses, coords, this.model.radii.far);
    if (far.length === 0) return null;

    const fuzzyResults: CandidateResult[] = [];

    for (const candidate of far) {
      const candidateData = this.preprocessAddress(candidate.address || '');
      const distance = this.calculateDistance(coords, candidate.coordinates);

      const fuzzyScore = this.calculateFuzzySimilarity(addressData.normalized, candidateData.normalized);
      const geoScore = Math.max(0, 1 - distance / this.model.radii.far);
      const combinedScore = fuzzyScore * 0.7 + geoScore * 0.3;

      if (combinedScore >= this.model.thresholds.minimal) {
        fuzzyResults.push({
          address: candidate,
          distance,
          score: combinedScore,
          textSimilarity: 0,
          semanticSimilarity: 0,
          structuralSimilarity: 0,
          fuzzyScore,
          method: 'fuzzy_global',
        });
      }
    }

    fuzzyResults.sort((a, b) => b.score - a.score);

    const best = fuzzyResults[0];
    if (best) {
      return this.applyProximityRule(best, coords);
    }

    return null;
  }

  // ========== Правило близости ==========

  /** ≤20м = 90% уверенность (perfect) */
  private applyProximityRule(result: CandidateResult, coords: { lat: number; lng: number }): CandidateResult {
    if (!result.address.coordinates?.lat || !result.address.coordinates?.lng) return result;

    const distance = this.calculateDistance(coords, result.address.coordinates);
    if (distance <= 20) {
      return {
        ...result,
        distance,
        score: 0.90,
        confidence: 'perfect',
      };
    }
    return result;
  }

  // ========== Композитный скор ==========

  private calculateCompositeScore(
    sourceData: PreprocessedAddress,
    candidateData: PreprocessedAddress,
    sourceCoords: { lat: number; lng: number },
    candidateCoords: { lat: number; lng: number },
  ): number {
    const distance = this.calculateDistance(sourceCoords, candidateCoords);
    const geoScore = Math.max(0, 1 - distance / this.model.radii.extended);
    const textScore = this.calculateAdvancedTextSimilarity(sourceData.normalized, candidateData.normalized);
    const semanticScore = this.calculateSemanticSimilarity(sourceData.components, candidateData.components);
    const structuralScore = this.calculateStructuralSimilarity(sourceData.tokens, candidateData.tokens);
    const fuzzyScore = this.calculateFuzzySimilarity(sourceData.normalized, candidateData.normalized);

    return Math.min(
      geoScore * this.model.weights.geospatial +
      textScore * this.model.weights.textual +
      semanticScore * this.model.weights.semantic +
      structuralScore * this.model.weights.structural +
      fuzzyScore * this.model.weights.fuzzy,
      1.0,
    );
  }

  // ========== Ранжирование кандидатов ==========

  private rankCandidates(
    sourceData: PreprocessedAddress,
    candidates: AdAddress[],
    sourceCoords: { lat: number; lng: number },
  ): CandidateResult[] {
    const results: CandidateResult[] = [];

    for (const candidate of candidates) {
      const candidateData = this.preprocessAddress(candidate.address || '');
      const score = this.calculateCompositeScore(sourceData, candidateData, sourceCoords, candidate.coordinates);

      results.push({
        address: candidate,
        distance: this.calculateDistance(sourceCoords, candidate.coordinates),
        score,
        textSimilarity: this.calculateAdvancedTextSimilarity(sourceData.normalized, candidateData.normalized),
        semanticSimilarity: this.calculateSemanticSimilarity(sourceData.components, candidateData.components),
        structuralSimilarity: this.calculateStructuralSimilarity(sourceData.tokens, candidateData.tokens),
        fuzzyScore: this.calculateFuzzySimilarity(sourceData.normalized, candidateData.normalized),
        method: 'ml_extended',
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // ========== Алгоритмы сходства ==========

  /** Продвинутое текстовое сходство (комбинация 5 алгоритмов) */
  private calculateAdvancedTextSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const levenshtein = this.normalizedLevenshtein(str1, str2);
    const jaccard = this.jaccardSimilarity(str1.split(/\s+/), str2.split(/\s+/));
    const ngram2 = this.ngramSimilarity(str1, str2, 2);
    const ngram3 = this.ngramSimilarity(str1, str2, 3);
    const lcs = this.longestCommonSubsequence(str1, str2) / Math.max(str1.length, str2.length);

    return levenshtein * 0.25 + jaccard * 0.25 + ngram2 * 0.2 + ngram3 * 0.15 + lcs * 0.15;
  }

  /** Семантическое сходство компонентов */
  private calculateSemanticSimilarity(comp1: AddressComponents, comp2: AddressComponents): number {
    let totalScore = 0;
    let componentCount = 0;

    // Улица (вес ×2)
    if (comp1.street && comp2.street) {
      totalScore += this.calculateAdvancedTextSimilarity(comp1.street, comp2.street) * 2;
      componentCount += 2;
    }

    // Номер дома (вес ×1.5)
    if (comp1.houseNumber && comp2.houseNumber) {
      const sim = comp1.houseNumber === comp2.houseNumber
        ? 1.0
        : this.calculateAdvancedTextSimilarity(comp1.houseNumber, comp2.houseNumber);
      totalScore += sim * 1.5;
      componentCount += 1.5;
    }

    // Строение
    if (comp1.building && comp2.building) {
      const sim = comp1.building === comp2.building
        ? 1.0
        : this.calculateAdvancedTextSimilarity(comp1.building, comp2.building);
      totalScore += sim;
      componentCount += 1;
    }

    // Направление (вес ×0.5)
    if (comp1.direction && comp2.direction) {
      totalScore += (comp1.direction === comp2.direction ? 1 : 0) * 0.5;
      componentCount += 0.5;
    }

    return componentCount > 0 ? totalScore / componentCount : 0;
  }

  /** Структурное сходство (Jaccard на множестве токенов) */
  private calculateStructuralSimilarity(tokens1: string[], tokens2: string[]): number {
    if (!tokens1.length || !tokens2.length) return 0;
    return this.jaccardSimilarity([...new Set(tokens1)], [...new Set(tokens2)]);
  }

  /** Нечеткое сходство */
  private calculateFuzzySimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);

    let matchCount = 0;
    for (const w1 of words1) {
      for (const w2 of words2) {
        if (w1.length >= 3 && w2.length >= 3 && this.normalizedLevenshtein(w1, w2) >= 0.7) {
          matchCount++;
          break;
        }
      }
    }

    return matchCount / Math.max(words1.length, words2.length);
  }

  // ========== Предобработка адресов ==========

  private preprocessAddress(address: string): PreprocessedAddress {
    const original = address;
    let normalized = address.toLowerCase().trim();

    // Удаляем префикс города
    normalized = normalized.replace(/^(москва,?\s*|спб,?\s*|санкт-петербург,?\s*)/i, '');

    // Нормализация по картам
    normalized = this.normalizeByMaps(normalized, this.normalizationMaps.streetTypes);
    normalized = this.normalizeByMaps(normalized, this.normalizationMaps.buildingTypes);
    normalized = this.normalizeByMaps(normalized, this.normalizationMaps.directions);
    normalized = this.normalizeByMaps(normalized, this.normalizationMaps.common);

    // Стандартизация пунктуации
    normalized = normalized.replace(/[^\w\sа-яё]/gi, ' ').replace(/\s+/g, ' ').trim();

    const components = this.extractAddressComponents(normalized);

    return {
      original,
      normalized,
      components,
      tokens: normalized.split(/\s+/).filter(t => t.length > 0),
    };
  }

  private aggressiveNormalize(address: string): string {
    if (!address) return '';

    let normalized = address.toLowerCase().trim();

    // Убираем город в начале и конце
    for (const prefix of this.obviousPatterns.cityPrefixes) {
      if (normalized.startsWith(prefix)) {
        normalized = normalized.substring(prefix.length).trim();
      }
    }
    for (const suffix of this.obviousPatterns.citySuffixes) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.substring(0, normalized.length - suffix.length).trim();
      }
    }

    // Агрессивная замена сокращений улиц
    for (const [abbr, full] of this.obviousPatterns.streetAbbreviations) {
      const escaped = abbr.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), full);
    }

    // Нормализация номеров домов
    normalized = normalized.replace(/(\d+)\s*([кк])\s*(\d+)/gi, '$1к$3');
    normalized = normalized.replace(/(\d+)\s*([кк])\s*$/gi, '$1к');
    normalized = normalized.replace(/(\d+)\s*([аа-яя])/gi, '$1$2');

    normalized = normalized.replace(/[.,;:\-]/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized;
  }

  private calculateObviousScore(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1.0;

    const tokens1 = str1.split(/\s+/).filter(t => t.length > 0);
    const tokens2 = str2.split(/\s+/).filter(t => t.length > 0);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    let matchingTokens = 0;
    for (const t1 of tokens1) {
      for (const t2 of tokens2) {
        if (t1 === t2 || this.tokensAreSimilar(t1, t2)) {
          matchingTokens++;
          break;
        }
      }
    }

    const baseScore = matchingTokens / Math.max(tokens1.length, tokens2.length);

    let bonus = 0;
    if (this.extractStreetNameSimple(str1) === this.extractStreetNameSimple(str2)) bonus += 0.3;
    if (this.extractHouseNumberSimple(str1) === this.extractHouseNumberSimple(str2)) bonus += 0.2;

    return Math.min(baseScore + bonus, 1.0);
  }

  // ========== Компоненты адреса ==========

  private extractAddressComponents(address: string): AddressComponents {
    return {
      street: this.extractStreetName(address),
      houseNumber: this.extractHouseNumber(address),
      building: this.extractBuildingInfo(address),
      direction: this.extractDirection(address),
    };
  }

  private extractStreetName(address: string): string | null {
    const match = address.match(/([а-яё\s]+?)\s+(улица|проспект|переулок|бульвар|площадь|набережная|шоссе|тупик|проезд|аллея|дорога)/i);
    return match ? match[1].trim() : null;
  }

  private extractHouseNumber(address: string): string | null {
    const patterns = [
      /\b(\d+[а-яё]*)\s*(?:корпус|к)\s*(\d+[а-яё]*)\b/gi,
      /\b(\d+[а-яё]*)\s*(?:строение|стр)\s*(\d+[а-яё]*)\b/gi,
      /\b(\d+[а-яё]*)\s*(?:дом|д)\s*(\d+[а-яё]*)\b/gi,
      /\b(\d+[а-яё]+)\b/gi,
      /\b(\d+)\b/gi,
    ];
    for (const p of patterns) {
      const m = address.match(p);
      if (m) return m[0].trim();
    }
    return null;
  }

  private extractBuildingInfo(address: string): string | null {
    const pattern = /(?:корпус|к|строение|стр|литер|лит|владение|влд)\s*([а-яё\d]+)/gi;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(address)) !== null) {
      matches.push(m[0].trim());
    }
    return matches.length > 0 ? matches.join(' ') : null;
  }

  private extractDirection(address: string): string | null {
    const match = address.match(/\b(северный|южный|восточный|западный|центральный|большой|малый|новый|старый|верхний|нижний)\b/gi);
    return match ? match[0].toLowerCase() : null;
  }

  private extractStreetNameSimple(address: string): string {
    const tokens = address.split(/\s+/);
    const streetTypes = ['улица', 'проспект', 'переулок', 'бульвар', 'площадь', 'шоссе', 'набережная'];
    for (let i = 0; i < tokens.length; i++) {
      if (streetTypes.includes(tokens[i])) {
        return i > 0 ? tokens[i - 1] : '';
      }
    }
    return tokens[0] || '';
  }

  private extractHouseNumberSimple(address: string): string {
    const match = address.match(/(\d+[а-яё]*к?\d*)/i);
    return match ? match[1] : '';
  }

  // ========== Географические утилиты ==========

  private normalizeCoordinates(lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null {
    const latN = lat != null ? parseFloat(String(lat)) : NaN;
    const lngN = lng != null ? parseFloat(String(lng)) : NaN;
    if (isNaN(latN) || isNaN(lngN)) return null;
    return { lat: latN, lng: lngN };
  }

  private getAddressesInRadius(addresses: AdAddress[], center: { lat: number; lng: number }, radius: number): AdAddress[] {
    return addresses.filter(addr => {
      if (addr.coordinates.lat == null || addr.coordinates.lng == null) return false;
      return this.calculateDistance(center, addr.coordinates) <= radius;
    });
  }

  /** Расстояние Хаверсина в метрах */
  private calculateDistance(
    c1: { lat: number; lng: number },
    c2: { lat: number; lng: number },
  ): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(c2.lat - c1.lat);
    const dLng = toRad(c2.lng - c1.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ========== Строковые алгоритмы ==========

  private normalizedLevenshtein(str1: string, str2: string): number {
    return 1 - this.levenshteinDistance(str1, str2) / Math.max(str1.length, str2.length);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (str1[i - 1] === str2[j - 1] ? 0 : 1),
        );
      }
    }

    return dp[m][n];
  }

  private jaccardSimilarity(arr1: string[], arr2: string[]): number {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = [...set1].filter(x => set2.has(x)).length;
    const union = new Set([...set1, ...set2]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private ngramSimilarity(str1: string, str2: string, n: number): number {
    return this.jaccardSimilarity(
      Array.from(this.getNgrams(str1, n)),
      Array.from(this.getNgrams(str2, n)),
    );
  }

  private getNgrams(str: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= str.length - n; i++) {
      ngrams.add(str.substr(i, n));
    }
    return ngrams;
  }

  private longestCommonSubsequence(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = str1[i - 1] === str2[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    return dp[m][n];
  }

  private tokensAreSimilar(t1: string, t2: string): boolean {
    if (Math.abs(t1.length - t2.length) <= 1) {
      return this.levenshteinDistance(t1, t2) <= 1;
    }
    return false;
  }

  private getConfidenceLevel(score: number): 'perfect' | 'high' | 'medium' | 'low' | 'very_low' | 'none' {
    if (score >= this.model.thresholds.perfect) return 'perfect';
    if (score >= this.model.thresholds.excellent) return 'high';
    if (score >= this.model.thresholds.good) return 'medium';
    if (score >= this.model.thresholds.acceptable) return 'low';
    if (score >= this.model.thresholds.minimal) return 'very_low';
    return 'none';
  }

  // ========== Карты нормализации ==========

  private normalizeByMaps(text: string, normMap: Map<string, string[]>): string {
    let result = text;
    for (const [, variants] of normMap) {
      const pattern = new RegExp(`\\b(${variants.join('|')})\\b`, 'gi');
      result = result.replace(pattern, (match) => {
        // Возвращаем каноническую форму (первый ключ карты, который содержит этот вариант)
        for (const [canonical, vars] of normMap) {
          if (vars.some(v => v.toLowerCase() === match.toLowerCase())) return canonical;
        }
        return match;
      });
    }
    return result;
  }

  private buildNormalizationMaps() {
    return {
      streetTypes: new Map<string, string[]>([
        ['улица', ['ул', 'улица', 'street', 'st', 'str']],
        ['проспект', ['пр', 'проспект', 'пр-т', 'пр-кт', 'проспкт', 'avenue', 'av', 'ave']],
        ['переулок', ['пер', 'переулок', 'перкулок', 'lane', 'ln']],
        ['бульвар', ['бул', 'бульвар', 'б-р', 'бр', 'boulevard', 'blvd']],
        ['площадь', ['пл', 'площадь', 'плошадь', 'square', 'sq']],
        ['набережная', ['наб', 'набережная', 'нбр', 'embankment', 'emb']],
        ['шоссе', ['ш', 'шоссе', 'шосе', 'highway', 'hwy']],
        ['тупик', ['туп', 'тупик', 'тупк', 'dead end']],
        ['проезд', ['пр-д', 'проезд', 'прзд', 'drive', 'dr']],
        ['аллея', ['ал', 'аллея', 'алея', 'alley']],
        ['дорога', ['дор', 'дорога', 'дрг', 'road', 'rd']],
        ['магистраль', ['маг', 'магистраль', 'мгстр']],
        ['линия', ['лин', 'линия', 'лня', 'line']],
      ]),
      buildingTypes: new Map<string, string[]>([
        ['дом', ['д', 'дом', 'house', 'h', 'home']],
        ['корпус', ['к', 'корп', 'корпус', 'кор', 'building', 'bld', 'corp']],
        ['строение', ['стр', 'строение', 'стрн', 'structure']],
        ['сооружение', ['соор', 'сооружение', 'сорж']],
        ['литер', ['лит', 'литер', 'лтр', 'letter', 'lit']],
        ['владение', ['влд', 'владение', 'влдн', 'possession']],
      ]),
      directions: new Map<string, string[]>([
        ['северный', ['сев', 'северный', 'север', 'north', 'n']],
        ['южный', ['юж', 'южный', 'юг', 'south', 's']],
        ['восточный', ['вост', 'восточный', 'восток', 'east', 'e']],
        ['западный', ['зап', 'западный', 'запад', 'west', 'w']],
        ['центральный', ['центр', 'центральный', 'цнтр', 'central', 'c']],
      ]),
      common: new Map<string, string[]>([
        ['большой', ['б', 'бол', 'большой', 'больш', 'big']],
        ['малый', ['м', 'мал', 'малый', 'мл', 'small']],
        ['новый', ['н', 'нов', 'новый', 'нвы', 'new']],
        ['старый', ['ст', 'стар', 'старый', 'стры', 'old']],
        ['верхний', ['верх', 'верхний', 'врх', 'upper']],
        ['нижний', ['ниж', 'нижний', 'нжн', 'lower']],
      ]),
    };
  }

  private buildObviousPatterns() {
    return {
      streetAbbreviations: new Map<string, string>([
        ['ул', 'улица'], ['улица', 'ул'],
        ['пр', 'проспект'], ['проспект', 'пр'], ['пр-т', 'проспект'], ['пр-кт', 'проспект'],
        ['пер', 'переулок'], ['переулок', 'пер'],
        ['б-р', 'бульвар'], ['бул', 'бульвар'], ['бульвар', 'б-р'],
        ['ш', 'шоссе'], ['шоссе', 'ш'],
        ['пл', 'площадь'], ['площадь', 'пл'],
        ['наб', 'набережная'], ['набережная', 'наб'],
        ['туп', 'тупик'], ['тупик', 'туп'],
        ['пр-д', 'проезд'], ['проезд', 'пр-д'],
      ]),
      cityPrefixes: ['москва,', 'мск,', 'спб,', 'санкт-петербург,'],
      citySuffixes: [', москва', ', мск', ', спб', ', санкт-петербург'],
    };
  }
}
