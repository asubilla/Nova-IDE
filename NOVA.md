# NOVA.md - Architecture Decisions

## Technology Stack
- **Framework**: React 18 with TypeScript
- **State Management**: Zustand (lightweight, no boilerplate)
- **Styling**: CSS with custom properties (no CSS-in-JS for performance)
- **Build Tool**: Vite (fast HMR, ESM-native)
- **Package Manager**: npm

## Architecture Patterns

### Component Structure
```
src/
├── components/
│   ├── layout/       # App shell components (TitleBar, Sidebar, etc.)
│   ├── orchestration/ # Agent orchestration UI
│   └── settings/     # Settings panels
├── config/           # Static configuration
├── store/            # Zustand stores
├── styles/           # Global CSS
├── types/            # TypeScript types
└── utils/            # Utility functions
```

### State Management
- Use Zustand for global state (patterns, settings, workflow)
- Keep local state in components when possible
- Use event bus for cross-component communication
- Avoid prop drilling beyond 3 levels

### Theming
- All colors defined as CSS custom properties in `:root`
- Dark theme as default, light theme as override
- Theme colors follow a consistent naming convention:
  - `--bg-*` for backgrounds
  - `--text-*` for text colors
  - `--accent*` for accent colors

### Orchestration Patterns
- **Sequential**: Chain of agents, each processing previous output
- **Concurrent**: Parallel execution with result merging
- **Handoff**: Context-aware agent transfers
- **Group Chat**: Multi-agent discussion format
- **Magentic**: Self-directed autonomous agent

### Key Decisions
1. **No CSS-in-JS**: Raw CSS for better performance and smaller bundle
2. **Zustand over Redux**: Less boilerplate, simpler mental model
3. **Component co-location**: Styles near components they belong to
4. **Event bus pattern**: Decoupled communication between features
5. **Type-first development**: Types defined before implementations

## Performance Targets
- Initial load: < 1s
- Time to interactive: < 2s
- Bundle size: < 500KB gzipped
- Memory usage: < 200MB for typical session

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
