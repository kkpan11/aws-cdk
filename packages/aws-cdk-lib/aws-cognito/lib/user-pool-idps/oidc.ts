import { Construct } from 'constructs';
import { UserPoolIdentityProviderProps } from './base';
import { UserPoolIdentityProviderBase } from './private/user-pool-idp-base';
import { Names, Token } from '../../../core';
import { ValidationError } from '../../../core/lib/errors';
import { addConstructMetadata } from '../../../core/lib/metadata-resource';
import { propertyInjectable } from '../../../core/lib/prop-injectable';
import { CfnUserPoolIdentityProvider } from '../cognito.generated';

/**
 * Properties to initialize UserPoolIdentityProviderOidc
 */
export interface UserPoolIdentityProviderOidcProps extends UserPoolIdentityProviderProps {
  /**
   * The client id
   */
  readonly clientId: string;

  /**
   * The client secret
   */
  readonly clientSecret: string;

  /**
   * Issuer URL
   */
  readonly issuerUrl: string;

  /**
   * The name of the provider
   *
   * @default - the unique ID of the construct
   */
  readonly name?: string;

  /**
   * The OAuth 2.0 scopes that you will request from OpenID Connect. Scopes are
   * groups of OpenID Connect user attributes to exchange with your app.
   *
   * @default ['openid']
   */
  readonly scopes?: string[];

  /**
   * Identifiers
   *
   * Identifiers can be used to redirect users to the correct IdP in multitenant apps.
   *
   * @default - no identifiers used
   */
  readonly identifiers?: string[];

  /**
   * The method to use to request attributes
   *
   * @default OidcAttributeRequestMethod.GET
   */
  readonly attributeRequestMethod?: OidcAttributeRequestMethod;

  /**
   * OpenID connect endpoints
   *
   * @default - auto discovered with issuer URL
   */
  readonly endpoints?: OidcEndpoints;
}

/**
 * OpenID Connect endpoints
 */
export interface OidcEndpoints {
  /**
   * Authorization endpoint
   */
  readonly authorization: string;

  /**
   * Token endpoint
   */
  readonly token: string;

  /**
   * UserInfo endpoint
   */
  readonly userInfo: string;

  /**
   * Jwks_uri endpoint
   */
  readonly jwksUri: string;
}

/**
 * The method to use to request attributes
 */
export enum OidcAttributeRequestMethod {
  /** GET */
  GET = 'GET',
  /** POST */
  POST = 'POST',
}

/**
 * Represents an identity provider that integrates with OpenID Connect
 * @resource AWS::Cognito::UserPoolIdentityProvider
 */
@propertyInjectable
export class UserPoolIdentityProviderOidc extends UserPoolIdentityProviderBase {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-cognito.UserPoolIdentityProviderOidc';
  public readonly providerName: string;

  constructor(scope: Construct, id: string, props: UserPoolIdentityProviderOidcProps) {
    super(scope, id, props);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const scopes = props.scopes ?? ['openid'];

    const resource = new CfnUserPoolIdentityProvider(this, 'Resource', {
      userPoolId: props.userPool.userPoolId,
      providerName: this.getProviderName(props.name),
      providerType: 'OIDC',
      providerDetails: {
        client_id: props.clientId,
        client_secret: props.clientSecret,
        authorize_scopes: scopes.join(' '),
        attributes_request_method: props.attributeRequestMethod ?? OidcAttributeRequestMethod.GET,
        oidc_issuer: props.issuerUrl,
        authorize_url: props.endpoints?.authorization,
        token_url: props.endpoints?.token,
        attributes_url: props.endpoints?.userInfo,
        jwks_uri: props.endpoints?.jwksUri,
      },
      idpIdentifiers: props.identifiers,
      attributeMapping: super.configureAttributeMapping(),
    });

    this.providerName = super.getResourceNameAttribute(resource.ref);
  }

  private getProviderName(name?: string): string {
    if (name) {
      if (!Token.isUnresolved(name) && (name.length < 3 || name.length > 32)) {
        throw new ValidationError(`Expected provider name to be between 3 and 32 characters, received ${name} (${name.length} characters)`, this);
      }
      // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cognito-userpoolidentityprovider.html#cfn-cognito-userpoolidentityprovider-providername
      // u is for unicode
      if (!name.match(/^[^_\p{Z}][\p{L}\p{M}\p{S}\p{N}\p{P}][^_\p{Z}]+$/u)) {
        throw new ValidationError(`Expected provider name must match [^_\p{Z}][\p{L}\p{M}\p{S}\p{N}\p{P}][^_\p{Z}]+, received ${name}`, this);
      }
      return name;
    }

    const uniqueId = Names.uniqueId(this);

    if (uniqueId.length < 3) {
      return `${uniqueId}oidc`;
    }

    if (uniqueId.length > 32) {
      return uniqueId.substring(0, 16) + uniqueId.substring(uniqueId.length - 16);
    }
    return uniqueId;
  }
}
