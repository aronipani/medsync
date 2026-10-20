import { Redirect } from 'expo-router';
import React from 'react';

// "About & safety" is now Privacy & safety (spec 21); old links land there.
export default function About() {
  return <Redirect href="/privacy" />;
}
