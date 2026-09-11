# StoreOps implementation documentation

Technical documentation for the StoreOps retail identity and data integration case study. The guides describe the implemented contracts, configuration responsibilities and acceptance criteria for a guided solution review.

## Solution review

Start with [Solution demonstration and acceptance](INTERVIEW-DEMO.md) for the business scenario, end-to-end workflow and expected evidence.

## Integration references

| Guide | Audience and purpose |
| --- | --- |
| [SAML SSO configuration](AUTH0-SETUP.md) | Identity and application administrators configuring Auth0 trust and assignment |
| [SCIM provisioning API](SCIM-FIRST-EXERCISE.md) | Integration teams creating and maintaining accounts |
| [Identity lifecycle and linking](SCIM-SAML-LINKING.md) | Reviewers assessing identity ownership and access behavior |
| [Administrative identity-link API](ADMIN-LINK-API.md) | Authorized operators associating provisioned accounts with Auth0 identities |
| [GraphQL metrics API](GRAPHQL-METRICS.md) | Clients consuming account metrics and handling query errors |
| [Data architecture and deployment](POSTGRESQL.md) | Operators reviewing storage, configuration and persistence |

## Conventions

Examples use fictional identities and environment placeholders. `{{baseUrl}}` selects the application environment; `{{userId}}` is the SCIM account ID; `{{auth0UserId}}` is the corresponding Auth0 user ID. `{{scimToken}}` and `{{adminToken}}` are distinct credentials supplied by an authorized operator.

The project is an independent demonstration. Each reference states its supported behavior and limitations; it should not be interpreted as a production service commitment or a complete implementation of every referenced protocol.

[Project overview](../README.md)
