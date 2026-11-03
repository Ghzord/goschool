# GoEvent

Protótipo acadêmico de inscrição em passeios e atividades escolares, desenvolvido com HTML, CSS e JavaScript.

## Como abrir

Abra `index.html` no Chrome, Edge ou Firefox atualizado. Mantenha `index.html`, `style.css`, `script.js` e a pasta `assets` juntos. Não é necessário instalar dependências. Os cartazes estão na pasta `assets` e funcionam sem internet. As fontes do Google são opcionais: sem internet, o sistema usa fontes locais.

## Acessibilidade em Libras

O botão flutuante do **VLibras** está disponível nas telas do aplicativo. A integração usa o script oficial `https://vlibras.gov.br/app/vlibras-plugin.js`, que inicializa o widget automaticamente. É necessário estar conectado à internet para carregar a ferramenta e usar seus recursos de tradução.

## Abertura e login do aluno

O app sempre abre no **login do aluno**, inclusive ao atualizar a página. Entre com o e-mail e a senha criados no cadastro. O botão **Entrar como organizador** abre o acesso separado da escola. Antes de entrar, nenhuma agenda ou escola é exibida na tela de login.

## Cadastro do aluno e seleção da escola

No primeiro acesso, clique em **Criar minha conta** e informe nome, e-mail, telefone com DDD, escola, senha com pelo menos 6 caracteres e confirmação da senha. **Escola parceira** aparece somente no campo de seleção do cadastro. A opção disponível é **Fortec**. A escola não aparece como propaganda ou identificação nas telas de entrada.

Após criar a conta escolhendo Fortec, o app abre a agenda de passeios dessa escola. Os exemplos são uma visita ao museu de ciência, uma saída ao museu de arte e um passeio ao jardim botânico. São exemplos fictícios para a apresentação, sem relação com uma programação real da escola.

Para participar, escolha um passeio, informe a turma e confirme. Nome, e-mail, telefone e escola vêm da conta. Em **Meu cadastro**, é possível atualizar os dados e, opcionalmente, a senha. A atualização de contato também é aplicada às inscrições vinculadas ao aluno. O botão **Sair** retorna ao login.

Cadastros da versão anterior sem senha são preservados. Para ativar esse acesso no protótipo, abra **Criar minha conta**, confirme o mesmo nome, e-mail, telefone e escola do cadastro antigo e defina uma senha. Essa compatibilidade é apenas local e não verifica identidade por e-mail.

## Login do organizador

- **E-mail:** `fortec@gmail.com`
- **Senha:** `fortec`
- **Escola vinculada:** Fortec

Na tela inicial, clique em **Entrar como organizador**. O organizador pode criar e editar passeios da Fortec, consultar inscritos e exportar a lista com telefone e escola. A escola do passeio é definida pelo acesso do organizador; não pode ser escolhida no formulário. A listagem, os totais, a edição, a consulta e a exportação verificam esse vínculo. **Sair do painel** encerra a sessão, limpa a lista de participantes e retorna ao login do aluno. O acesso do aluno e o do organizador são separados.

Na lista **Participantes**, o botão **Remover** cancela a inscrição daquele aluno após uma confirmação com o nome e o passeio. A vaga é liberada, os contadores e a exportação são atualizados e o cadastro do aluno é mantido. O aluno pode se inscrever novamente se houver vagas e o prazo do passeio estiver aberto. A remoção também verifica o acesso do organizador à escola do evento.

## Roteiro para a apresentação

1. Abra o app e mostre a tela inicial de login do aluno, sem uma escola identificada.
2. Crie uma conta com dados fictícios, escolha Fortec e defina a senha. Mostre a agenda da escola.
3. Saia e entre novamente como aluno com o e-mail e a senha escolhidos.
4. Inscreva-se em um passeio e confira o indicador **Inscrito**.
5. Saia, clique em **Entrar como organizador** e entre com o acesso acima.
6. Consulte os participantes do passeio e exporte a lista CSV. Crie outro passeio com apenas **1 vaga**.
7. Saia do painel, entre com a conta do aluno e inscreva-se nesse passeio. Mostre que as vagas acabaram.
8. Atualize a página: o login do aluno reaparece. Depois de entrar, os dados e as inscrições continuam salvos.

## Limites do protótipo

Os cadastros e os passeios ficam no `localStorage` e não são compartilhados entre dispositivos ou perfis. As senhas dos alunos são derivadas com PBKDF2 e um salt individual; o texto da senha não é salvo no cadastro ou na sessão. A sessão é reiniciada ao abrir ou atualizar a página, conforme o fluxo de entrada do app. Não existe servidor ou banco de dados central. O login e a separação por escola são demonstrações locais: as credenciais de exemplo do organizador estão no JavaScript e o navegador permite alterar o código e os dados. Isso não constitui autenticação ou isolamento de segurança para uso real. Uma versão em produção exige autenticação, autorização por escola, validação de vagas e persistência no servidor.

Use dados fictícios. Limpar os dados do navegador apaga os registros. O comportamento do armazenamento em arquivos locais pode variar conforme o navegador; use sempre o mesmo navegador e caminho durante a apresentação. Os exemplos iniciais sem alterações ou inscritos são atualizados para os passeios. Eventos personalizados, cadastros e inscrições anteriores são preservados. Inscrições antigas sem telefone aparecem com esse dado não informado.

## Relação com a atividade

- Cadastro de eventos: nome, categoria, data, horário, local, descrição e vagas.
- Cadastro de aluno: nome, e-mail, telefone, escola e senha.
- Inscrição: dados do cadastro do aluno e turma.
- Controle de vagas: limite de capacidade, contador e bloqueio de evento lotado ou encerrado.
- Consulta de inscritos: lista por evento da escola do organizador e exportação CSV.

O protótipo complementa a documentação de Gerência de Projetos do grupo. A apresentação também deve abordar responsabilidades, cronograma, riscos e critérios de sucesso descritos no trabalho.
