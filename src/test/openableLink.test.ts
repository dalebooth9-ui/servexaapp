import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isModifiedClick, openableLinkProps } from '../lib/openableLink';

const click = (over: Record<string, unknown> = {}) =>
  ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault: vi.fn(), ...over }) as any;

beforeEach(() => {
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('routes a plain left click to the job or site it shows', () => {
  const navigate = vi.fn();
  const props = openableLinkProps('/jobs/7', navigate);
  props.onClick(click());
  expect(navigate).toHaveBeenCalledWith('/jobs/7');
});

it('leaves Ctrl/Cmd and Shift clicks to the browser so they open a new tab', () => {
  const navigate = vi.fn();
  const props = openableLinkProps('/jobs/7', navigate);
  props.onClick(click({ ctrlKey: true }));
  props.onClick(click({ metaKey: true }));
  props.onClick(click({ shiftKey: true }));
  expect(navigate).not.toHaveBeenCalled();
  expect(isModifiedClick(click({ ctrlKey: true }))).toBe(true);
});

it('opens a new tab on middle click and stops the autoscroll', () => {
  const navigate = vi.fn();
  const props = openableLinkProps('/sites?site=9', navigate);
  const event = click({ button: 1 });
  props.onMouseDown(event);
  expect(window.open).toHaveBeenCalledWith('/sites?site=9', '_blank', 'noopener,noreferrer');
  expect(event.preventDefault).toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it('ignores a click the row already handled itself', () => {
  const navigate = vi.fn();
  const props = openableLinkProps('/jobs/7', navigate);
  props.onClick(click({ defaultPrevented: true }));
  expect(navigate).not.toHaveBeenCalled();
});

it('opens the destination from the keyboard', () => {
  const navigate = vi.fn();
  const props = openableLinkProps('/jobs/7', navigate);
  const event = { key: 'Enter', preventDefault: vi.fn() } as any;
  props.onKeyDown(event);
  expect(navigate).toHaveBeenCalledWith('/jobs/7');
  expect(event.preventDefault).toHaveBeenCalled();
});
