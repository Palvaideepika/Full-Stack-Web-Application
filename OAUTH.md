# OAuth Investigation

## What is OAuth?

OAuth (Open Authorization) is an authorization framework that allows an application to access specific resources from another service without requiring the user to share their password with the application.

## Why is OAuth Used?

OAuth is commonly used when an application needs to access data or services provided by another platform.

Examples include:
- Signing in with Google
- Accessing GitHub resources
- Connecting applications to third-party services

## OAuth Flow

A typical OAuth process includes:

1. The user requests access to a third-party service.
2. The application redirects the user to the authorization provider.
3. The user gives permission.
4. The authorization provider returns an authorization code.
5. The application exchanges the code for an access token.
6. The application uses the access token to access permitted resources.

## Access Tokens

An access token is used by an application to make authorized requests to an API.

The token should be protected and should not be exposed publicly.

## OAuth and This Project

For this internship project, OAuth was investigated as part of the Advanced API Usage and External API Integration task.

The project currently uses JWT-based authentication for user login and authorization. OAuth was researched as an additional authentication and authorization approach.

## Security Considerations

When implementing OAuth:

- Keep client secrets private.
- Use HTTPS in production.
- Store tokens securely.
- Request only the permissions required.
- Handle expired or invalid tokens properly.

## Conclusion

OAuth provides a secure and standardized way for applications to obtain limited access to resources from external services without directly handling the user's password.