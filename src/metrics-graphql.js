import { buildSchema, graphql, GraphQLError } from 'graphql';
import { record } from './activity.js';

// The schema is the list of fields clients may request. There are no writes.
export const metricsSchema = buildSchema(`
    type StoreCount {
        storeId: String!
        users: Int!
    }
    type Metrics {
        totalUsers: Int!
        activeUsers: Int!
        inactiveUsers: Int!
        usersByStore: [StoreCount!]!
    }
    type Query {
        metrics: Metrics!
    }
`);

export function metricsHandler(users) {
    return async (req, res) => {
        const { query, variables, operationName } = req.body || {};
        if (typeof query !== 'string' || !query.trim() || query.length > 12000 ||
            (variables != null && (typeof variables !== 'object' || Array.isArray(variables))) ||
            (operationName != null && typeof operationName !== 'string')) {
            return res.status(400).json({ errors: [{ message: 'Provide a query string, optional variables object and optional operationName string.' }] });
        }
        record(null, 'graphql.request.received', 'GraphQL request received', 'A client sent a query. GraphQL will validate it against the metrics schema.');
        let snapshot;
        const rootValue = {
            metrics: () => {
                // Aliases may request metrics more than once. Read the database only once per request.
                snapshot ??= Promise.resolve().then(() => users.metrics()).catch(() => {
                    throw new GraphQLError('Metrics are temporarily unavailable.');
                });
                return snapshot;
            }
        };
        const result = await graphql({ schema: metricsSchema, source: query, rootValue,
            variableValues: variables, operationName });
        if (result.errors) {
            record(null, 'graphql.request.rejected', 'GraphQL query failed', 'The query could not be validated or completed. No raw query or database error is logged.', 'error');
        } else {
            record(null, 'graphql.metrics.served', 'GraphQL response returned', 'The response contains only the fields selected by the client.');
        }
        // Errors without a field path (including an unsupported mutation) reject the request.
        // Resolver errors have a field path and may return data:null with HTTP 200.
        const requestFailed = result.errors?.length && result.errors.every(error => !error.path);
        res.status(requestFailed ? 400 : 200).json(result);
    };
}
