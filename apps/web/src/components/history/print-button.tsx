'use client';

import { Button } from '@/components/ui/index';

export function PrintButton() {
  return (
    <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
      Print
    </Button>
  );
}
