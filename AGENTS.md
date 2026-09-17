# AGENTS.md - Project Rules for AI Agents

## Project Overview
Nova IDE is a modern, AI-powered code editor built with React and TypeScript.

## Code Style Rules

### TypeScript
- Use TypeScript for all new files
- Prefer interfaces over types for object shapes
- Use `readonly` for immutable data
- Avoid `any` - use `unknown` and narrow types
- Use explicit return types on exported functions

### React
- Use functional components with hooks
- Prefer named exports over default exports
- Keep components under 200 lines
- Extract reusable logic into custom hooks
- Use React.FC for component type annotations

### CSS
- Use CSS custom properties (variables) for theme values
- Follow BEM-like naming for component classes
- Avoid inline styles except for dynamic values
- Use the theme color variables defined in layout.css

## File Organization
- Components go in `src/components/{category}/`
- Types go in `src/types/`
- Utilities go in `src/utils/`
- Config files go in `src/config/`
- Styles go in `src/styles/`

## Naming Conventions
- Files: PascalCase for components, camelCase for utilities
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- CSS classes: kebab-case
- Constants: SCREAMING_SNAKE_CASE

## Testing
- Write unit tests for utility functions
- Test component rendering with React Testing Library
- Mock external dependencies in tests
- Aim for 80%+ code coverage on critical paths

## Git Conventions
- Commit messages: `<type>(<scope>): <description>`
- Types: feat, fix, docs, style, refactor, test, chore
- Keep commits atomic and focused
- Never commit secrets or API keys

## Performance
- Memoize expensive computations with useMemo
- Use React.lazy for route-based code splitting
- Avoid unnecessary re-renders with React.memo
- Use virtualization for long lists

## Security
- Never log or expose API keys
- Validate all user inputs
- Use environment variables for secrets
- Follow OWASP guidelines for web security
