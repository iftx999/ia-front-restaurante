# Melhorias visuais — progresso (CONCLUÍDO)

Checklist de retomada caso o trabalho seja interrompido (ex.: queda de energia).
Marque `[x]` conforme cada item for concluído.

- [x] 1. Trocar emojis (💬 📊 ⚠️) por ícones SVG de traço, consistentes com os já usados
      (botão "Nova conversa", botão "Enviar"). Feito em:
      - src/app/chat/chat.component.html/scss (empty-state__icon: balão SVG)
      - src/app/analise/analise.component.html/scss (relatorio-vazio__icone: gráfico SVG;
        alerta da tabela: triângulo SVG com cor --color-danger)
      (✓ de "limites salvos"/upload OK mantido — é glifo de texto monocromático, não emoji colorido)

- [x] 2. Sidebar mobile (≤720px) — evitar que ocupe a tela toda antes do conteúdo.
      Feito em src/app/shared/sidebar/sidebar.component.{ts,html,scss}: nav/conteúdo
      projetado/footer agora ficam em .sidebar__body, escondido por padrão em mobile
      e revelado por um botão hambúrguer (menuAberto / alternarMenu()).

- [x] 3. Melhorar estados vazios ("Nenhum relatório gerado", "Como posso ajudar hoje?").
      Feito: analise.component.html/scss (lista de 3 passos numerados no lugar do parágrafo);
      chat.component.ts/html/scss (chips clicáveis com perguntas de exemplo, preenchem o input).

- [x] 4. Tabela de relatório (analise) — adicionar hover state e zebra striping.
      Feito em src/app/analise/analise.component.scss (.relatorio__tabela tbody tr)

## Notas
- Projeto NÃO é repositório git — não há como usar `git diff` para ver o que mudou.
  Este arquivo é a fonte da verdade do progresso.
- Servidor dev: `npm start` (ng serve) na pasta sistemaia-frontend, porta 4200.
- Build de sanidade: `npx ng build --configuration development` (deve compilar sem erro).
- Tema/design system já existente e não deve ser alterado: variáveis CSS em src/styles.scss
  (dark theme verde, radius/shadow tokens).
