import { AlertTriangle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'titanai-scalping-disclaimer-dismissed';

export function ScalpingDisclaimer() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(STORAGE_KEY) !== '1');
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-warning/40 bg-warning/10 text-warning-foreground">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-start gap-3 text-xs">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
        <p className="flex-1 leading-relaxed text-foreground/90">
          <strong>TitanAI is experimental trading software.</strong> Crypto trading is high risk.
          This app does not guarantee profits. Always paper trade before using real funds.
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, '1');
            setShow(false);
          }}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
