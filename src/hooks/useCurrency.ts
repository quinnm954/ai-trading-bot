import { useState, useEffect } from 'react';

interface CurrencyInfo {
  code: string;
  symbol: string;
  rate: number; // Rate relative to USD
}

// Common currencies with approximate exchange rates (updated periodically)
const CURRENCY_DATA: Record<string, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$', rate: 1 },
  EUR: { code: 'EUR', symbol: '€', rate: 0.92 },
  GBP: { code: 'GBP', symbol: '£', rate: 0.79 },
  CAD: { code: 'CAD', symbol: 'CA$', rate: 1.36 },
  AUD: { code: 'AUD', symbol: 'A$', rate: 1.53 },
  JPY: { code: 'JPY', symbol: '¥', rate: 149 },
  CHF: { code: 'CHF', symbol: 'CHF', rate: 0.88 },
  CNY: { code: 'CNY', symbol: '¥', rate: 7.24 },
  INR: { code: 'INR', symbol: '₹', rate: 83.1 },
  BRL: { code: 'BRL', symbol: 'R$', rate: 4.97 },
  MXN: { code: 'MXN', symbol: 'MX$', rate: 17.15 },
  KRW: { code: 'KRW', symbol: '₩', rate: 1320 },
  SGD: { code: 'SGD', symbol: 'S$', rate: 1.34 },
  HKD: { code: 'HKD', symbol: 'HK$', rate: 7.82 },
  SEK: { code: 'SEK', symbol: 'kr', rate: 10.42 },
  NOK: { code: 'NOK', symbol: 'kr', rate: 10.65 },
  DKK: { code: 'DKK', symbol: 'kr', rate: 6.87 },
  PLN: { code: 'PLN', symbol: 'zł', rate: 3.98 },
  ZAR: { code: 'ZAR', symbol: 'R', rate: 18.5 },
  NZD: { code: 'NZD', symbol: 'NZ$', rate: 1.64 },
  AED: { code: 'AED', symbol: 'د.إ', rate: 3.67 },
  THB: { code: 'THB', symbol: '฿', rate: 35.5 },
  PHP: { code: 'PHP', symbol: '₱', rate: 55.8 },
  IDR: { code: 'IDR', symbol: 'Rp', rate: 15700 },
  MYR: { code: 'MYR', symbol: 'RM', rate: 4.47 },
  VND: { code: 'VND', symbol: '₫', rate: 24500 },
  TWD: { code: 'TWD', symbol: 'NT$', rate: 31.5 },
  TRY: { code: 'TRY', symbol: '₺', rate: 32.1 },
  RUB: { code: 'RUB', symbol: '₽', rate: 92 },
  ILS: { code: 'ILS', symbol: '₪', rate: 3.65 },
  CZK: { code: 'CZK', symbol: 'Kč', rate: 23.2 },
  HUF: { code: 'HUF', symbol: 'Ft', rate: 358 },
  RON: { code: 'RON', symbol: 'lei', rate: 4.57 },
  CLP: { code: 'CLP', symbol: 'CLP$', rate: 890 },
  COP: { code: 'COP', symbol: 'COL$', rate: 3950 },
  ARS: { code: 'ARS', symbol: 'ARS$', rate: 850 },
  PEN: { code: 'PEN', symbol: 'S/', rate: 3.72 },
  NGN: { code: 'NGN', symbol: '₦', rate: 1550 },
  EGP: { code: 'EGP', symbol: 'E£', rate: 48.5 },
  PKR: { code: 'PKR', symbol: '₨', rate: 278 },
  BDT: { code: 'BDT', symbol: '৳', rate: 110 },
  UAH: { code: 'UAH', symbol: '₴', rate: 41.2 },
  SAR: { code: 'SAR', symbol: '﷼', rate: 3.75 },
  QAR: { code: 'QAR', symbol: 'ق.ر', rate: 3.64 },
  KWD: { code: 'KWD', symbol: 'د.ك', rate: 0.31 },
};

// Language/locale to currency code mapping
const LOCALE_TO_CURRENCY: Record<string, string> = {
  'en-US': 'USD', 'en-GB': 'GBP', 'en-AU': 'AUD', 'en-CA': 'CAD', 'en-NZ': 'NZD',
  'en-SG': 'SGD', 'en-HK': 'HKD', 'en-IN': 'INR', 'en-PH': 'PHP', 'en-ZA': 'ZAR',
  'de': 'EUR', 'de-DE': 'EUR', 'de-AT': 'EUR', 'de-CH': 'CHF',
  'fr': 'EUR', 'fr-FR': 'EUR', 'fr-CA': 'CAD', 'fr-CH': 'CHF', 'fr-BE': 'EUR',
  'es': 'EUR', 'es-ES': 'EUR', 'es-MX': 'MXN', 'es-AR': 'ARS', 'es-CL': 'CLP', 'es-CO': 'COP', 'es-PE': 'PEN',
  'it': 'EUR', 'it-IT': 'EUR', 'it-CH': 'CHF',
  'pt': 'EUR', 'pt-PT': 'EUR', 'pt-BR': 'BRL',
  'nl': 'EUR', 'nl-NL': 'EUR', 'nl-BE': 'EUR',
  'ja': 'JPY', 'ja-JP': 'JPY',
  'ko': 'KRW', 'ko-KR': 'KRW',
  'zh': 'CNY', 'zh-CN': 'CNY', 'zh-TW': 'TWD', 'zh-HK': 'HKD',
  'ru': 'RUB', 'ru-RU': 'RUB',
  'ar': 'SAR', 'ar-SA': 'SAR', 'ar-AE': 'AED', 'ar-EG': 'EGP',
  'hi': 'INR', 'hi-IN': 'INR',
  'th': 'THB', 'th-TH': 'THB',
  'vi': 'VND', 'vi-VN': 'VND',
  'id': 'IDR', 'id-ID': 'IDR',
  'ms': 'MYR', 'ms-MY': 'MYR',
  'tr': 'TRY', 'tr-TR': 'TRY',
  'pl': 'PLN', 'pl-PL': 'PLN',
  'uk': 'UAH', 'uk-UA': 'UAH',
  'cs': 'CZK', 'cs-CZ': 'CZK',
  'ro': 'RON', 'ro-RO': 'RON',
  'hu': 'HUF', 'hu-HU': 'HUF',
  'sv': 'SEK', 'sv-SE': 'SEK',
  'no': 'NOK', 'nb': 'NOK', 'nn': 'NOK',
  'da': 'DKK', 'da-DK': 'DKK',
  'fi': 'EUR', 'fi-FI': 'EUR',
  'el': 'EUR', 'el-GR': 'EUR',
  'he': 'ILS', 'he-IL': 'ILS',
  'bn': 'BDT', 'bn-BD': 'BDT', 'bn-IN': 'INR',
  'ta': 'INR', 'ta-IN': 'INR',
  'ur': 'PKR', 'ur-PK': 'PKR',
  'fil': 'PHP', 'tl': 'PHP',
};

export function useCurrency() {
  const [currency, setCurrency] = useState<CurrencyInfo>(CURRENCY_DATA.USD);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocale, setUserLocale] = useState<string>('en-US');

  useEffect(() => {
    function detectCurrencyFromDevice() {
      // Get browser language/locale
      const browserLocale = navigator.language || navigator.languages?.[0] || 'en-US';
      setUserLocale(browserLocale);

      // Check localStorage for user preference first
      const savedCurrency = localStorage.getItem('preferred_currency');
      if (savedCurrency && CURRENCY_DATA[savedCurrency]) {
        setCurrency(CURRENCY_DATA[savedCurrency]);
        setIsLoading(false);
        return;
      }

      // Try exact locale match first, then language code only
      let currencyCode = LOCALE_TO_CURRENCY[browserLocale];
      if (!currencyCode) {
        const langCode = browserLocale.split('-')[0];
        currencyCode = LOCALE_TO_CURRENCY[langCode];
      }

      if (currencyCode && CURRENCY_DATA[currencyCode]) {
        setCurrency(CURRENCY_DATA[currencyCode]);
        localStorage.setItem('preferred_currency', currencyCode);
      }

      setIsLoading(false);
    }

    detectCurrencyFromDevice();
  }, []);

  const formatPrice = (usdAmount: number): string => {
    const convertedAmount = usdAmount * currency.rate;
    
    try {
      // Use Intl.NumberFormat with user's locale for proper formatting
      return new Intl.NumberFormat(userLocale, {
        style: 'currency',
        currency: currency.code,
        minimumFractionDigits: 0,
        maximumFractionDigits: convertedAmount >= 1000 ? 0 : 2,
      }).format(convertedAmount);
    } catch {
      // Fallback if currency code not supported by Intl
      if (currency.rate >= 100) {
        return `${currency.symbol}${Math.round(convertedAmount).toLocaleString(userLocale)}`;
      }
      return `${currency.symbol}${convertedAmount.toLocaleString(userLocale, { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
      })}`;
    }
  };

  const changeCurrency = (code: string) => {
    if (CURRENCY_DATA[code]) {
      setCurrency(CURRENCY_DATA[code]);
      localStorage.setItem('preferred_currency', code);
    }
  };

  return {
    currency,
    userLocale,
    isLoading,
    formatPrice,
    changeCurrency,
    availableCurrencies: Object.keys(CURRENCY_DATA),
  };
}
