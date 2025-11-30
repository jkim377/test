// src/main.ts
import App from './App.svelte';
import { mount } from 'svelte';

const target = document.getElementById('app') as HTMLElement;

const app = mount(App, {
  target
});

export default app;
