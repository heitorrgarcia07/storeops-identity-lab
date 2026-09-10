# Módulo 01 — conectar Auth0 ao StoreOps

Objetivo: você configurar o IdP e conseguir explicar cada campo. O login real só estará validado depois dos testes com seu tenant.

## 1. Criar aplicação

No painel Auth0, abra **Applications → Applications → Create Application**.
Nome: **StoreOps Identity Lab**. Tipo: **Regular Web Applications**.

Em **Addons**, habilite **SAML2 Web App**. Este fluxo usa Auth0 como IdP.
Não crie uma Enterprise SAML Connection: ela serve para o sentido oposto.
A disponibilidade contratual do addon deve ser confirmada no seu tenant; este guia não exige compra ou upgrade.

## 2. Configurar o addon

Em **Application Callback URL**, cole:

```text
http://localhost:3000/auth/saml/acs
```

Em **Settings**, cole o conteúdo de `config/auth0-addon.json` e salve.

- Audience identifica o StoreOps: `urn:storeops:local`.
- ACS/Recipient é o endereço que recebe a resposta.
- NameID vem do `user_id` estável do Auth0, não do e-mail.
- O Auth0 assina a assertion com RSA-SHA256. `signResponse` permanece `false` porque a aplicação exige a assertion assinada.
- O navegador entrega o POST em localhost; neste módulo SAML não é necessário publicar um endpoint para o servidor Auth0 acessá-lo diretamente.

## 3. Criar um usuário de laboratório

Habilite uma conexão Database para a aplicação e crie um usuário de teste nessa conexão em **User Management → Users**. Use um e-mail sob seu controle e defina a senha diretamente no Auth0.

No perfil desse usuário, edite **app_metadata** (não `user_metadata`):

```json
{"storeops_access": true, "storeId": "101"}
```

Essa configuração administrativa representa a atribuição do usuário à aplicação. Para outro usuário, use loja `102`. Não use dados reais de clientes.

## 4. Autorizar e mapear atributos com uma Action

Em **Actions**, crie uma Action customizada para **Login / Post Login**. Cole `config/auth0-post-login-action.js`.

Na Action, adicione o secret `STOREOPS_CLIENT_ID` com o **Client ID** da aplicação (esse identificador não é o Client Secret).
Faça **Deploy**, adicione a Action ao fluxo de Login e aplique/salve o fluxo.

A Action limita o acesso aos usuários com `app_metadata.storeops_access=true` e envia `storeId`, `email` e `displayName`. Usuários sem essa atribuição devem ser negados mesmo que consigam autenticar no tenant.

## 5. Configurar o StoreOps

Na aba **Usage** do addon, obtenha:

| Auth0 | StoreOps `.env` |
|---|---|
| Identity Provider Login URL | `IDP_SSO_URL` |
| Issuer | `IDP_ISSUER` |
| Certificado público PEM | Salvar em `config/auth0-signing.pem` |

Copie os valores exatamente como exibidos. Não deduza o Issuer pelo domínio.
Não é necessário Client Secret, token da Management API ou chave privada.

Reinicie o servidor e acesse `http://localhost:3000` no mesmo computador. Clique **Entrar com SSO**. Não use o botão de teste do addon como teste de aceite: o laboratório exige uma solicitação iniciada pelo StoreOps.

## 6. Teste guiado

1. Login de usuário autorizado: abrir dashboard da loja correta e mostrar conta criada por JIT.
2. Logout local e novo login: preservar identificador interno, mostrar conta existente.
3. Usuário da loja 102: mostrar somente loja 102. Parâmetros de URL não escolhem a loja.
4. Remover `storeops_access` no Auth0 e tentar novo login: acesso negado pelo IdP.
5. Restaurar acesso. Remover `storeId`: acesso negado; não criar conta parcial.
6. Alterar audience temporariamente: rejeitar; restaurar e iniciar login novamente.
7. Usar certificado incorreto: rejeitar; restaurar e reiniciar.
8. `JIT_ENABLED=false` e novo usuário: negar criação; contas existentes ativas continuam funcionando.

Logout encerra somente a sessão StoreOps, não a sessão Auth0. Mudanças no Auth0 não revogam automaticamente uma sessão local já aberta neste módulo (expira em uma hora). SCIM/revogação serão tratados depois.

## Conceitos para explicar em voz alta

- Auth0 autentica; StoreOps confia no certificado configurado para validar a assertion.
- SAML comprova a identidade; JIT cria a conta local após a validação.
- Autenticação não basta: a atribuição e a loja determinam o acesso.
- O vínculo `(issuer, NameID)` preserva a conta quando o e-mail muda.
- `InResponseTo` relaciona a resposta à solicitação; o fluxo também verifica o navegador que iniciou o login.

## Referências oficiais

- https://auth0.com/docs/authenticate/single-sign-on/outbound-single-sign-on/configure-auth0-saml-identity-provider
- https://auth0.com/docs/authenticate/protocols/saml/saml-configuration/customize-saml-assertions
- https://auth0.com/docs/actions/reference/post-login/post-login-api-object
