import { startTransition } from 'react';
import { Platform } from 'react-native';

type ViewTransitionLike = {
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

export function navigateWithViewTransition(
  navigate: () => void,
  transitionType: 'nav-forward' | 'nav-back' | 'surface-shift' = 'nav-forward',
) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    navigate();
    return;
  }

  const viewTransitionDocument = document as ViewTransitionDocument;
  if (!viewTransitionDocument.startViewTransition) {
    navigate();
    return;
  }

  document.documentElement.dataset.viewTransition = transitionType;
  const transition = viewTransitionDocument.startViewTransition(() => {
    startTransition(() => {
      navigate();
      delete document.documentElement.dataset.viewTransition;
    });
  });
  void transition.finished.catch(() => undefined);
}
