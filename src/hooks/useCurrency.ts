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

// Country code to currency code mapping
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  CA: 'CAD', AU: 'AUD', JP: 'JPY', CH: 'CHF', CN: 'CNY', IN: 'INR', BR: 'BRL',
  MX: 'MXN', KR: 'KRW', SG: 'SGD', HK: 'HKD', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  PL: 'PLN', ZA: 'ZAR', NZ: 'NZD', AE: 'AED', TH: 'THB', PH: 'PHP', ID: 'IDR',
  MY: 'MYR', VN: 'VND', TW: 'TWD', TR: 'TRY', RU: 'RUB', IL: 'ILS', CZ: 'CZK',
  HU: 'HUF', RO: 'RON', CL: 'CLP', CO: 'COP', AR: 'ARS', PE: 'PEN', NG: 'NGN',
  EG: 'EGP', PK: 'PKR', BD: 'BDT', UA: 'UAH', SA: 'SAR', QA: 'QAR', KW: 'KWD',
  SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR',
};

export function useCurrency() {
  const [currency, setCurrency] = useState<CurrencyInfo>(CURRENCY_DATA.USD);
  const [isLoading, setIsLoading] = useState(true);
  const [countryCode, setCountryCode] = useState<string>('US');

  useEffect(() => {
    async function detectCurrency() {
      try {
        // Check localStorage for user preference first
        const savedCurrency = localStorage.getItem('preferred_currency');
        if (savedCurrency && CURRENCY_DATA[savedCurrency]) {
          setCurrency(CURRENCY_DATA[savedCurrency]);
          setIsLoading(false);
          return;
        }

        // Use free IP geolocation API
        const response = await fetch('https://ipapi.co/json/', {
          signal: AbortSignal.timeout(3000),
        });
        
        if (response.ok) {
          const data = await response.json();
          const detectedCountry = data.country_code || 'US';
          setCountryCode(detectedCountry);
          
          const currencyCode = COUNTRY_TO_CURRENCY[detectedCountry] || 'USD';
          const detectedCurrency = CURRENCY_DATA[currencyCode] || CURRENCY_DATA.USD;
          
          setCurrency(detectedCurrency);
          localStorage.setItem('preferred_currency', detectedCurrency.code);
        }
      } catch (error) {
        // Fallback to USD on error
        console.log('Currency detection failed, using USD');
      } finally {
        setIsLoading(false);
      }
    }

    detectCurrency();
  }, []);

  const formatPrice = (usdAmount: number): string => {
    const convertedAmount = usdAmount * currency.rate;
    
    // Format based on currency
    if (currency.rate >= 100) {
      // For currencies with high rates (JPY, KRW, IDR, etc.), show no decimals
      return `${currency.symbol}${Math.round(convertedAmount).toLocaleString()}`;
    }
    
    return `${currency.symbol}${convertedAmount.toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    })}`;
  };

  const changeCurrency = (code: string) => {
    if (CURRENCY_DATA[code]) {
      setCurrency(CURRENCY_DATA[code]);
      localStorage.setItem('preferred_currency', code);
    }
  };

  return {
    currency,
    countryCode,
    isLoading,
    formatPrice,
    changeCurrency,
    availableCurrencies: Object.keys(CURRENCY_DATA),
  };
}
