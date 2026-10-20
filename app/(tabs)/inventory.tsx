import { Redirect } from 'expo-router';
import React from 'react';

// Stock is Medicines → Supplies now (spec 21); old links land there.
export default function Inventory() {
  return <Redirect href={{ pathname: '/meds', params: { view: 'supplies' } }} />;
}
