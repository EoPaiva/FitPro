# 🏋️‍♂️ FitPro — Personal Trainer Prototype

O **FitPro** é um protótipo de plataforma para Personal Trainers e seus alunos. Ele oferece uma interface moderna e intuitiva para gestão de treinos, acompanhamento de progresso físico, acesso a conteúdos exclusivos e interação com a comunidade.

> [!IMPORTANT]
> 🚧 **Status do Projeto:** 🔴 **Pausado**
> Este é um protótipo funcional front-end focado na experiência do usuário (UX/UI). Os dados são persistidos temporariamente no navegador.

---

## ✨ Funcionalidades Principais

* **Dashboard Inteligente:** Visão geral dos próximos treinos, gráficos de evolução de peso e progresso em desafios.
* **Gestão de Agenda:** Sistema de agendamento de aulas e visualização de sessões futuras (atalho `Ctrl + N` ou `Cmd + N` para criar novo treino).
* **Planos e Assinaturas:** Interface para escolha de pacotes (Básico, Pro, Premium).
* **Área de Conteúdo:** Biblioteca de vídeos para treinos HIIT, mobilidade e download de materiais educativos (e-books).
* **Avaliação Física:** Registro de métricas corporais (Peso e % de Gordura) com geração de gráficos dinâmicos.
* **Comunidade:** Feed para compartilhamento de conquistas e interação entre membros com proteção contra injeção de script (HTML Escape).
* **Sistema de Autenticação:** Fluxos de Login e Cadastro (Simulados) preparados para futura integração com backend.

---

## 🚀 Tecnologias Utilizadas

O projeto foi construído utilizando tecnologias web modernas sem necessidade de frameworks pesados:

* **HTML5 & CSS3:** Estrutura e estilização avançada com variáveis CSS, Grid Layout e efeitos de Glassmorphism.
* **JavaScript (Vanilla):** Lógica da aplicação de página única (SPA), manipulação de DOM e persistência de dados.
* **[Chart.js](https://www.chartjs.org/):** Renderização de gráficos dinâmicos e responsivos de evolução física.
* **[Font Awesome (v6.4.2)](https://fontawesome.com/):** Biblioteca de ícones profissionais.
* **Google Fonts (Inter):** Tipografia focada em legibilidade e interfaces modernas.
* **LocalStorage:** Persistência de dados local para manter o estado da aplicação entre as sessões do navegador.

---

## 🛠️ Como Executar o Projeto

Como este é um protótipo estático de arquivo único, a execução é extremamente simples:

1.  Clone este repositório ou faça o download do arquivo `.html`.
2.  Abra o arquivo diretamente em qualquer navegador moderno (Chrome, Firefox, Edge ou Safari).
3.  **Para testar com dados de demonstração:** * **E-mail:** `alex@exemplo.com`
    * **Senha:** Qualquer senha (o protótipo valida o e-mail demo ou aceita novos registros).

---

## 📱 Responsividade e UI/UX

O FitPro foi desenhado com o conceito **Mobile-First** em mente:
* **Desktop:** Menu lateral completo, cards em grid de 3 colunas e aproveitamento de tela cheia.
* **Mobile (Abaixo de 900px):** A barra lateral transforma-se dinamicamente num menu de navegação horizontal superior/inferior com rolagem contínua, ocultando textos longos e otimizando o espaço útil.

---

## 📝 Roadmap de Desenvolvimento

- [x] Interface básica e navegação por abas.
- [x] Gráficos de evolução de peso e gordura com Chart.js.
- [x] Persistência local com `localStorage`.
- [x] Modais dinâmicos usando `<template>` HTML.
- [ ] Integração com banco de dados real (Firebase / Node.js / PostgreSQL).
- [ ] Upload real de vídeos de treino e e-books.
- [ ] Gateway de pagamento integrado para assinatura dos planos.
- [ ] Integração com APIs de Smartwatches (Apple Watch / Garmin).

---

**Protótipo FitPro — 2025**
