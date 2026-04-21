import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** Minimal runtime surface of a Trix editor instance (the one reachable via
 *  `trixEditorElement.editor`). Just the methods we actually call. */
interface TrixEditorInstance {
  loadHTML(html: string): void;
  getDocument(): unknown;
}

interface TrixEditorElement extends HTMLElement {
  readonly editor: TrixEditorInstance;
  value: string;
}

type TrixEditorProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement> & {
    input?: string;
    placeholder?: string;
    class?: string;
  },
  HTMLElement
>;

// React 19 resolves JSX via the `React.JSX` namespace, so we augment that.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'trix-editor': TrixEditorProps;
      'trix-toolbar': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { id?: string },
        HTMLElement
      >;
    }
  }
}

// Legacy global JSX namespace kept for tooling that still looks here.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'trix-editor': TrixEditorProps;
      'trix-toolbar': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { id?: string },
        HTMLElement
      >;
    }
  }

  interface HTMLElementTagNameMap {
    'trix-editor': TrixEditorElement;
  }
}

export {};
