import { IResource, Resource } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { CfnClusterParameterGroup } from 'aws-cdk-lib/aws-redshift';
import { addConstructMetadata, MethodMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * A parameter group
 */
export interface IClusterParameterGroup extends IResource {
  /**
   * The name of this parameter group
   *
   * @attribute
   */
  readonly clusterParameterGroupName: string;
}

/**
 * A new cluster or instance parameter group
 */
abstract class ClusterParameterGroupBase extends Resource implements IClusterParameterGroup {
  /**
   * The name of the parameter group
   */
  public abstract readonly clusterParameterGroupName: string;
}

/**
 * Properties for a parameter group
 */
export interface ClusterParameterGroupProps {
  /**
   * Description for this parameter group
   *
   * @default a CDK generated description
   */
  readonly description?: string;

  /**
   * The parameters in this parameter group
   */
  readonly parameters: { [name: string]: string };
}

/**
 * A cluster parameter group
 *
 * @resource AWS::Redshift::ClusterParameterGroup
 */
@propertyInjectable
export class ClusterParameterGroup extends ClusterParameterGroupBase {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-redshift-alpha.ClusterParameterGroup';

  /**
   * Imports a parameter group
   */
  public static fromClusterParameterGroupName(scope: Construct, id: string, clusterParameterGroupName: string): IClusterParameterGroup {
    class Import extends Resource implements IClusterParameterGroup {
      public readonly clusterParameterGroupName = clusterParameterGroupName;
    }
    return new Import(scope, id);
  }

  /**
   * The name of the parameter group
   */
  public readonly clusterParameterGroupName: string;

  /**
   * The parameters in the parameter group
   */
  readonly parameters: { [name: string]: string };

  /**
   * The underlying CfnClusterParameterGroup
   */
  private readonly resource: CfnClusterParameterGroup;

  constructor(scope: Construct, id: string, props: ClusterParameterGroupProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);
    this.parameters = props.parameters;
    this.resource = new CfnClusterParameterGroup(this, 'Resource', {
      description: props.description || 'Cluster parameter group for family redshift-1.0',
      parameterGroupFamily: 'redshift-1.0',
      parameters: this.parseParameters(),
    });

    this.clusterParameterGroupName = this.resource.ref;
  }
  private parseParameters(): any {
    return Object.entries(this.parameters).map(([name, value]) => {
      return { parameterName: name, parameterValue: value };
    });
  }

  /**
   * Adds a parameter to the parameter group
   *
   * @param name the parameter name
   * @param value the parameter name
   */
  @MethodMetadata()
  public addParameter(name: string, value: string): void {
    const existingValue = Object.entries(this.parameters).find(([key, _]) => key === name)?.[1];
    if (existingValue === undefined) {
      this.parameters[name] = value;
      this.resource.parameters = this.parseParameters();
    } else if (existingValue !== value) {
      throw new Error(`The parameter group already contains the parameter "${name}", but with a different value (Given: ${value}, Existing: ${existingValue}).`);
    }
  }
}
