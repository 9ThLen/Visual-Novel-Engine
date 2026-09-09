import React from 'react';
import { render, screen } from '@testing-library/react';

describe('smoke', () => {
  it('renders a basic element', () => {
    render(<div data-testid="hello">hello world</div>);
    expect(screen.getByTestId('hello')).toBeDefined();
  });
});
