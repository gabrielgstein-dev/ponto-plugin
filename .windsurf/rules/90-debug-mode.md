---
trigger: manual
---

# Modo Debug

Ao debugar, siga estas regras:

1. **NUNCA comprimir ou resumir** o corpo de funções ao analisar — mostre o código completo relevante
2. **Analisar o Render Tree completo**: componente → pai → hook/estado → efeito colateral
3. **Explicar o porquê** do bug antes de propor qualquer fix
4. **Investigar nesta ordem**:
   - Props → estado local → estado global → efeito colateral → rede
5. **Sem refatoração durante debug** — foco exclusivo no bug
6. **Early returns para isolamento** — isolar o problema com retornos antecipados antes de tentar resolver
7. **Em erros de tipagem**: mostrar tipo real vs tipo esperado
8. **Não sugerir mudanças de arquitetura ou estilo** — resolver apenas o problema reportado
