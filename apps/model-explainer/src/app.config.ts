/**
 * App configuration. No JSX here: tools/seed-fabric.mjs loads this file in Node to export seed rows, so the nav icons
 * use createElement and the logomark uses path strings.
 */
import { createElement } from 'react';
import { BookOpen, FileText, GitFork, HeartPulse, MessagesSquare, Network } from 'lucide-react';

import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { connectorServices } from './config/fabric';
import { defs, type Schema } from './model';
import { seed } from './seed';

export const personas: Persona[] = [
  { sub: 'demo-admin', name: 'Alex Rivera', email: 'alex@example.com', isAdmin: true, role: 'Model owner' },
  { sub: 'demo-user', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Analyst' },
];

export const config: AppConfig<Schema> = {
  appId: 'model-explainer',
  title: 'Semantic Model Explainer',
  tagline: 'Open a semantic model and understand it in two minutes.',
  credit: 'A fork of the original by Michael John Peña (MIT)',
  accent: 'cyan',
  // Two tables joined by a relationship.
  logoPaths: ['M5 4h4a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M15 13h4a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z', 'M11 7.5c2.5 0-.5 9 2 9'],
  defs,
  personas,
  seed,
  nav: [
    { to: '/', label: 'Diagram', end: true, icon: createElement(Network) },
    { to: '/star-chart', label: 'Relationships', icon: createElement(GitFork) },
    { to: '/field-guide', label: 'Tables & measures', icon: createElement(BookOpen) },
    { to: '/space-weather', label: 'Health', icon: createElement(HeartPulse) },
    { to: '/probes', label: 'Sample questions', icon: createElement(MessagesSquare) },
    { to: '/mission-brief', label: 'Summary', icon: createElement(FileText) },
  ],
  // Connector-only app: no data service. Identity (Person) uses an in-memory store in Fabric mode too.
  fabric: { data: false, extraServices: connectorServices },
};
