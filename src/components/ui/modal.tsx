'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { Button } from './button';

type ModalProps = {
  children: ReactNode;
  isOpen: boolean;
  title: string;
  onClose?: () => void;
  closeLabel: string;
};

export function Modal({ children, isOpen, title, onClose, closeLabel }: ModalProps) {
  const close = () => {
    if (typeof onClose === 'function') onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPointerEvents = document.body.style.pointerEvents;
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = '';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.pointerEvents = previousPointerEvents;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end overflow-hidden bg-ink/35 p-0 sm:place-items-center sm:p-4" onClick={close}>
      <div
        className="max-h-[92dvh] w-full touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-lg border border-border bg-background p-4 shadow-soft sm:max-w-4xl sm:rounded-lg sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <Button onClick={close} type="button" variant="ghost">
            {closeLabel}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
