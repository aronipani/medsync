import { useGlobalSearchParams, useIsFocused } from 'expo-router';
import React from 'react';

/**
 * Pages kept inside the tab bar (so the bottom tabs stay visible) stay mounted when you leave them.
 * This starts them fresh each time they're opened, so a person's screen never shows someone else's
 * details or half-made changes from last time.
 */
export function freshOnFocus<P extends object>(Screen: React.ComponentType<P>) {
  return function Fresh(props: P) {
    const focused = useIsFocused();
    const params = useGlobalSearchParams();
    if (!focused) return null;
    return <Screen key={JSON.stringify(params)} {...props} />;
  };
}
