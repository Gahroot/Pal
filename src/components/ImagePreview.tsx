import * as Dialog from "@radix-ui/react-dialog";

interface ImagePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt?: string;
}

export function ImagePreview({ open, onOpenChange, src, alt }: ImagePreviewProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-0 z-[9999] flex items-center justify-center p-8"
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <div className="relative overflow-hidden rounded-[16px] border border-glass-border bg-panel-bg shadow-2xl backdrop-blur-xl">
            {/* Close button */}
            <Dialog.Close className="absolute top-3 right-3 z-10 rounded-[8px] bg-glass p-1.5 text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>

            <img
              src={src}
              alt={alt ?? "Preview"}
              className="block"
              style={{ maxWidth: 960, maxHeight: 780, objectFit: "contain" }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
