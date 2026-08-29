import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export default function GlobalErrorToasts() {
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = (e.reason && (e.reason.message || String(e.reason))) || 'Необработанная ошибка';
      toast({ title: 'Необработанная ошибка', description: String(msg), variant: 'destructive' });
    };
    const onError = (e: ErrorEvent) => {
      const msg = e.message || 'Ошибка';
      toast({ title: 'Ошибка', description: String(msg), variant: 'destructive' });
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.removeEventListener('error', onError);
    };
  }, []);
  return null;
}
