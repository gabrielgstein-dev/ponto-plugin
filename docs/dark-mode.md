# Dark Mode

O plugin agora suporta alternância entre tema claro e escuro diretamente na interface, sem precisar reconstruir.

## Como Funciona

### Botão de Alternância
Um botão está disponível no topo do popup e do sidepanel com três modos:
- **☀️ LIGHT**: Força tema claro
- **🌙 DARK**: Força tema escuro
- **🌙/☀️ AUTO**: Segue o tema do sistema (automático)

### Persistência
A preferência do usuário é salva automaticamente no localStorage e persiste entre sessões.

### Onde Funciona
- ✅ Popup principal
- ✅ Sidepanel (histórico)
- ✅ Widget flutuante
- ✅ Timesheet (quando disponível)

## Tema Meta

O tema Meta agora possui duas variantes:

### Tema Claro
- Fundo: `#f9fafb` (cinza muito claro)
- Superfícies: Branco e cinza claro
- Acento: `#0032ff` (azul vibrante)
- Texto: `#111827` (cinza escuro)

### Tema Escuro
- Fundo: `#0f1117` (cinza muito escuro)
- Superfícies: `#1a1d23` e `#23272f`
- Acento: `#3b82f6` (azul mais suave)
- Texto: `#f9fafb` (branco)

## Implementação

### Hook useThemeMode
```typescript
const { themeMode, isDark, setTheme, toggleTheme } = useThemeMode();
```

### Componente ThemeToggle
```tsx
<ThemeToggle />
```

### CSS Variables
O sistema utiliza CSS variables com suporte a dark mode:
```css
:root {
  --bg: #f9fafb;
  --text: #111827;
  /* ... */
}

.dark {
  --bg: var(--dark-bg);
  --text: var(--dark-text);
  /* ... */
}
```

## Transições Suaves

Todas as mudanças de tema possuem transições suaves de 0.2s para evitar flashes bruscos.

## Compatibilidade

- Chrome: ✅
- Firefox: ✅
- Edge: ✅

## Notas Técnicas

1. O tema é aplicado via classe `.dark` no elemento `html`
2. O widget sincroniza o tema via storage events
3. A inicialização do tema ocorre antes do React renderizar para evitar FOUC (Flash of Unstyled Content)
