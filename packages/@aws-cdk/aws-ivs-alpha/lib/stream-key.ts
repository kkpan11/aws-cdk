import * as core from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { IChannel } from './channel';
import { CfnStreamKey } from 'aws-cdk-lib/aws-ivs';
import { addConstructMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * Represents an IVS Stream Key
 */
export interface IStreamKey extends core.IResource {
  /**
   * The stream-key ARN. For example: arn:aws:ivs:us-west-2:123456789012:stream-key/g1H2I3j4k5L6
   *
   * @attribute
   */
  readonly streamKeyArn: string;
}

/**
 * Properties for creating a new Stream Key
 */
export interface StreamKeyProps {
  /**
   * Channel ARN for the stream.
   */
  readonly channel: IChannel;
}

/**
 * A new IVS Stream Key
 */
@propertyInjectable
export class StreamKey extends core.Resource implements IStreamKey {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ivs-alpha.StreamKey';
  public readonly streamKeyArn: string;

  /**
   * The stream-key value. For example: sk_us-west-2_abcdABCDefgh_567890abcdef
   *
   * @attribute
   */
  public readonly streamKeyValue: string;

  constructor(scope: Construct, id: string, props: StreamKeyProps) {
    super(scope, id, {});
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const resource = new CfnStreamKey(this, 'Resource', {
      channelArn: props.channel.channelArn,
    });

    this.streamKeyArn = resource.attrArn;
    this.streamKeyValue = resource.attrValue;
  }
}
