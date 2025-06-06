import { Construct } from 'constructs';
import { Annotations } from './annotations';
import { CfnResource } from './cfn-resource';
import { Duration } from './duration';
import { ValidationError } from './errors';
import { addConstructMetadata, MethodMetadata } from './metadata-resource';
import { propertyInjectable } from './prop-injectable';
import { RemovalPolicy } from './removal-policy';
import { Resource } from './resource';
import { Token } from './token';

/**
 * Properties to provide a Lambda-backed custom resource
 */
export interface CustomResourceProps {
  /**
   * The ARN of the provider which implements this custom resource type.
   *
   * You can implement a provider by listening to raw AWS CloudFormation events
   * and specify the ARN of an SNS topic (`topic.topicArn`) or the ARN of an AWS
   * Lambda function (`lambda.functionArn`) or use the CDK's custom [resource
   * provider framework] which makes it easier to implement robust providers.
   *
   * [resource provider framework]:
   * https://docs.aws.amazon.com/cdk/api/latest/docs/custom-resources-readme.html
   *
   * Provider framework:
   *
   * ```ts
   * // use the provider framework from aws-cdk/custom-resources:
   * const provider = new customresources.Provider(this, 'ResourceProvider', {
   *   onEventHandler,
   *   isCompleteHandler, // optional
   * });
   *
   * new CustomResource(this, 'MyResource', {
   *   serviceToken: provider.serviceToken,
   * });
   * ```
   *
   * AWS Lambda function (not recommended to use AWS Lambda Functions directly,
   * see the module README):
   *
   * ```ts
   * // invoke an AWS Lambda function when a lifecycle event occurs:
   * new CustomResource(this, 'MyResource', {
   *   serviceToken: myFunction.functionArn,
   * });
   * ```
   *
   * SNS topic (not recommended to use AWS Lambda Functions directly, see the
   * module README):
   *
   * ```ts
   * // publish lifecycle events to an SNS topic:
   * new CustomResource(this, 'MyResource', {
   *   serviceToken: myTopic.topicArn,
   * });
   * ```
   *
   * Maps to [ServiceToken](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cloudformation-customresource.html#cfn-cloudformation-customresource-servicetoken) property for the `AWS::CloudFormation::CustomResource` resource
   */
  readonly serviceToken: string;

  /**
   * The maximum time that can elapse before a custom resource operation times out.
   *
   * The value must be between 1 second and 3600 seconds.
   *
   * Maps to [ServiceTimeout](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cloudformation-customresource.html#cfn-cloudformation-customresource-servicetimeout) property for the `AWS::CloudFormation::CustomResource` resource
   *
   * A token can be specified for this property, but it must be specified with `Duration.seconds()`.
   *
   * @example
   * const stack = new Stack();
   * const durToken = new CfnParameter(stack, 'MyParameter', {
   *   type: 'Number',
   *   default: 60,
   * });
   * new CustomResource(stack, 'MyCustomResource', {
   *   serviceToken: 'MyServiceToken',
   *   serviceTimeout: Duration.seconds(durToken.valueAsNumber),
   * });
   *
   * @default Duration.seconds(3600)
   */
  readonly serviceTimeout?: Duration;

  /**
   * Properties to pass to the Lambda
   *
   * Values in this `properties` dictionary can possibly overwrite other values in `CustomResourceProps`
   * E.g. `ServiceToken` and `ServiceTimeout`
   * It is recommended to avoid using same keys that exist in `CustomResourceProps`
   *
   * @default - No properties.
   */
  readonly properties?: { [key: string]: any };

  /**
   * For custom resources, you can specify AWS::CloudFormation::CustomResource
   * (the default) as the resource type, or you can specify your own resource
   * type name. For example, you can use "Custom::MyCustomResourceTypeName".
   *
   * Custom resource type names must begin with "Custom::" and can include
   * alphanumeric characters and the following characters: _@-. You can specify
   * a custom resource type name up to a maximum length of 60 characters. You
   * cannot change the type during an update.
   *
   * Using your own resource type names helps you quickly differentiate the
   * types of custom resources in your stack. For example, if you had two custom
   * resources that conduct two different ping tests, you could name their type
   * as Custom::PingTester to make them easily identifiable as ping testers
   * (instead of using AWS::CloudFormation::CustomResource).
   *
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cfn-customresource.html#aws-cfn-resource-type-name
   *
   * @default - AWS::CloudFormation::CustomResource
   */
  readonly resourceType?: string;

  /**
   * The policy to apply when this resource is removed from the application.
   *
   * @default cdk.RemovalPolicy.Destroy
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Convert all property keys to pascal case.
   *
   * @default false
   */
  readonly pascalCaseProperties?: boolean;
}

/**
 * Instantiation of a custom resource, whose implementation is provided a Provider
 *
 * This class is intended to be used by construct library authors. Application
 * builder should not be able to tell whether or not a construct is backed by
 * a custom resource, and so the use of this class should be invisible.
 *
 * Instead, construct library authors declare a custom construct that hides the
 * choice of provider, and accepts a strongly-typed properties object with the
 * properties your provider accepts.
 *
 * Your custom resource provider (identified by the `serviceToken` property)
 * can be one of 4 constructs:
 *
 * - If you are authoring a construct library or application, we recommend you
 *   use the `Provider` class in the `custom-resources` module.
 * - If you are authoring a construct for the CDK's AWS Construct Library,
 *   you should use the `CustomResourceProvider` construct in this package.
 * - If you want full control over the provider, you can always directly use
 *   a Lambda Function or SNS Topic by passing the ARN into `serviceToken`.
 *
 * @resource AWS::CloudFormation::CustomResource
 */
@propertyInjectable
export class CustomResource extends Resource {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.core.CustomResource';
  private readonly resource: CfnResource;

  constructor(scope: Construct, id: string, props: CustomResourceProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const type = renderResourceType(this, props.resourceType);
    const pascalCaseProperties = props.pascalCaseProperties ?? false;
    const properties = pascalCaseProperties ? uppercaseProperties(props.properties || {}) : (props.properties || {});

    if (props.serviceTimeout !== undefined && !props.serviceTimeout.isUnresolved()) {
      const serviceTimeoutSeconds = props.serviceTimeout.toSeconds();

      if (serviceTimeoutSeconds < 1 || serviceTimeoutSeconds > 3600) {
        throw new ValidationError(`serviceTimeout must either be between 1 and 3600 seconds, got ${serviceTimeoutSeconds}`, this);
      }
    }

    const constructPropertiesPassed = {
      ServiceToken: props.serviceToken,
      ServiceTimeout: props.serviceTimeout?.toSeconds().toString(),
    };

    const hasCommonKeys = Object.keys(properties).some(key => key in constructPropertiesPassed);

    if (hasCommonKeys) {
      Annotations.of(this).addWarningV2('@aws-cdk/core:customResourcePropConflict', `The following keys will be overwritten as they exist in the 'properties' prop. Keys found: ${Object.keys(properties).filter(key => key in constructPropertiesPassed)}`);
    }

    this.resource = new CfnResource(this, 'Default', {
      type,
      properties: {
        ...constructPropertiesPassed,
        ...properties,
      },
    });

    this.resource.applyRemovalPolicy(props.removalPolicy, {
      default: RemovalPolicy.DESTROY,
    });
  }

  /**
   * The physical name of this custom resource.
   */
  public get ref() {
    return this.resource.ref;
  }

  /**
   * Returns the value of an attribute of the custom resource of an arbitrary
   * type. Attributes are returned from the custom resource provider through the
   * `Data` map where the key is the attribute name.
   *
   * @param attributeName the name of the attribute
   * @returns a token for `Fn::GetAtt`. Use `Token.asXxx` to encode the returned `Reference` as a specific type or
   * use the convenience `getAttString` for string attributes.
   */
  @MethodMetadata()
  public getAtt(attributeName: string) {
    return this.resource.getAtt(attributeName);
  }

  /**
   * Returns the value of an attribute of the custom resource of type string.
   * Attributes are returned from the custom resource provider through the
   * `Data` map where the key is the attribute name.
   *
   * @param attributeName the name of the attribute
   * @returns a token for `Fn::GetAtt` encoded as a string.
   */
  @MethodMetadata()
  public getAttString(attributeName: string): string {
    return Token.asString(this.getAtt(attributeName));
  }
}

/**
 * Uppercase the first letter of every property name
 *
 * It's customary for CloudFormation properties to start with capitals, and our
 * properties to start with lowercase, so this function translates from one
 * to the other
 */
function uppercaseProperties(props: { [key: string]: any }) {
  const ret: { [key: string]: any } = {};
  Object.keys(props).forEach(key => {
    const upper = key.slice(0, 1).toUpperCase() + key.slice(1);
    ret[upper] = props[key];
  });
  return ret;
}

function renderResourceType(scope: Construct, resourceType?: string) {
  if (!resourceType) {
    return 'AWS::CloudFormation::CustomResource';
  }

  if (!resourceType.startsWith('Custom::')) {
    throw new ValidationError(`Custom resource type must begin with "Custom::" (${resourceType})`, scope);
  }

  if (resourceType.length > 60) {
    throw new ValidationError(`Custom resource type length > 60 (${resourceType})`, scope);
  }

  const typeName = resourceType.slice(resourceType.indexOf('::') + 2);
  if (!/^[a-z0-9_@-]+$/i.test(typeName)) {
    throw new ValidationError(`Custom resource type name can only include alphanumeric characters and _@- (${typeName})`, scope);
  }

  return resourceType;
}
