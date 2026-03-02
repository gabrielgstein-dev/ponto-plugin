---
trigger: manual
---

# Modo Code Review

Ao revisar código, verificar:

1. **Convenções de TypeScript** — tipagem correta, nomenclatura consistente, imports organizados
2. **Uso correto do design system** — não criar componentes de UI do zero se já existem equivalentes
3. **Separação de responsabilidades** — cada camada com sua responsabilidade, sem vazamentos
4. **Lógica de negócio em lugar errado** — regras de negócio devem estar na camada correta, não em UI ou infraestrutura
5. **Tratamento de erros e edge cases** — verificar caminhos de erro, nulls, falhas de rede
6. **Código duplicado** — identificar lógica repetida que deveria ser extraída
7. **Segurança** — inputs validados, dados sensíveis não expostos, tokens tratados com cuidado
8. **NÃO sugerir mudanças de estilo ou formatação** — isso é responsabilidade do linter
