const React = require('react');

export const Image = React.forwardRef((props: any, ref: any) => {
  const { source, contentFit, cachePolicy, placeholder, transition, onError, style, ...rest } = props;
  const src = typeof source === 'string' ? source : source?.uri;
  return React.createElement('img', {
    ...rest,
    ref,
    src,
    alt: rest.alt || '',
    style,
    'data-content-fit': contentFit,
    'data-cache-policy': cachePolicy,
    'data-placeholder': placeholder ? 'true' : undefined,
    'data-transition': transition,
    onError,
  });
});

