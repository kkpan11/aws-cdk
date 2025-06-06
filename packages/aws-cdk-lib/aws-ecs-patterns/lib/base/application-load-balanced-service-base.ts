import { Construct } from 'constructs';
import { Certificate, CertificateValidation, ICertificate } from '../../../aws-certificatemanager';
import { IVpc } from '../../../aws-ec2';
import {
  AwsLogDriver, BaseService, CloudMapOptions, Cluster, ContainerImage, DeploymentController, DeploymentCircuitBreaker,
  ICluster, LogDriver, PropagatedTagSource, Secret, CapacityProviderStrategy,
} from '../../../aws-ecs';
import {
  ApplicationListener, ApplicationLoadBalancer, ApplicationProtocol, ApplicationProtocolVersion, ApplicationTargetGroup,
  IApplicationLoadBalancer, ListenerCertificate, ListenerAction, AddApplicationTargetsProps, SslPolicy,
  IpAddressType,
  ApplicationLoadBalancerProps,
} from '../../../aws-elasticloadbalancingv2';
import { IRole } from '../../../aws-iam';
import { ARecord, IHostedZone, RecordTarget, CnameRecord } from '../../../aws-route53';
import { LoadBalancerTarget } from '../../../aws-route53-targets';
import { CfnOutput, Duration, Stack, Token, ValidationError } from '../../../core';

/**
 * Describes the type of DNS record the service should create
 */
export enum ApplicationLoadBalancedServiceRecordType {
  /**
   * Create Route53 A Alias record
   */
  ALIAS,
  /**
   * Create a CNAME record
   */
  CNAME,
  /**
   * Do not create any DNS records
   */
  NONE,
}

/**
 * The properties for the base ApplicationLoadBalancedEc2Service or ApplicationLoadBalancedFargateService service.
 */
export interface ApplicationLoadBalancedServiceBaseProps {
  /**
   * The name of the cluster that hosts the service.
   *
   * If a cluster is specified, the vpc construct should be omitted. Alternatively, you can omit both cluster and vpc.
   * @default - create a new cluster; if both cluster and vpc are omitted, a new VPC will be created for you.
   */
  readonly cluster?: ICluster;

  /**
   * The VPC where the container instances will be launched or the elastic network interfaces (ENIs) will be deployed.
   *
   * If a vpc is specified, the cluster construct should be omitted. Alternatively, you can omit both vpc and cluster.
   * @default - uses the VPC defined in the cluster or creates a new VPC.
   */
  readonly vpc?: IVpc;

  /**
   * The properties required to create a new task definition. TaskDefinition or TaskImageOptions must be specified, but not both.
   *
   * @default none
   */
  readonly taskImageOptions?: ApplicationLoadBalancedTaskImageOptions;

  /**
   * Determines whether the Load Balancer will be internet-facing.
   *
   * @default true
   */
  readonly publicLoadBalancer?: boolean;

  /**
   * Determines whether or not the Security Group for the Load Balancer's Listener will be open to all traffic by default.
   *
   * @default true -- The security group allows ingress from all IP addresses.
   */
  readonly openListener?: boolean;

  /**
   * The desired number of instantiations of the task definition to keep running on the service.
   * The minimum value is 1
   *
   * @default - The default is 1 for all new services and uses the existing service's desired count
   * when updating an existing service.
   */
  readonly desiredCount?: number;

  /**
   * Certificate Manager certificate to associate with the load balancer.
   * Setting this option will set the load balancer protocol to HTTPS.
   *
   * @default - No certificate associated with the load balancer, if using
   * the HTTP protocol. For HTTPS, a DNS-validated certificate will be
   * created for the load balancer's specified domain name if a domain name
   * and domain zone are specified.
   */
  readonly certificate?: ICertificate;

  /**
   * The protocol for connections from the load balancer to the ECS tasks.
   * The default target port is determined from the protocol (port 80 for
   * HTTP, port 443 for HTTPS).
   *
   * @default HTTP.
   */
  readonly targetProtocol?: ApplicationProtocol;

  /**
   * The protocol for connections from clients to the load balancer.
   * The load balancer port is determined from the protocol (port 80 for
   * HTTP, port 443 for HTTPS).  If HTTPS, either a certificate or domain
   * name and domain zone must also be specified.
   *
   * @default HTTP. If a certificate is specified, the protocol will be
   * set by default to HTTPS.
   */
  readonly protocol?: ApplicationProtocol;

  /**
   * The protocol version to use
   *
   * @default ApplicationProtocolVersion.HTTP1
   */
  readonly protocolVersion?: ApplicationProtocolVersion;

  /**
   * The domain name for the service, e.g. "api.example.com."
   *
   * @default - No domain name.
   */
  readonly domainName?: string;

  /**
   * The Route53 hosted zone for the domain, e.g. "example.com."
   *
   * @default - No Route53 hosted domain zone.
   */
  readonly domainZone?: IHostedZone;

  /**
   * The name of the service.
   *
   * @default - CloudFormation-generated name.
   */
  readonly serviceName?: string;

  /**
   * The period of time, in seconds, that the Amazon ECS service scheduler ignores unhealthy
   * Elastic Load Balancing target health checks after a task has first started.
   *
   * @default - defaults to 60 seconds if at least one load balancer is in-use and it is not already set
   */
  readonly healthCheckGracePeriod?: Duration;

  /**
   * The maximum number of tasks, specified as a percentage of the Amazon ECS
   * service's DesiredCount value, that can run in a service during a
   * deployment.
   *
   * @default - 100 if daemon, otherwise 200
   */
  readonly maxHealthyPercent?: number;

  /**
   * The minimum number of tasks, specified as a percentage of
   * the Amazon ECS service's DesiredCount value, that must
   * continue to run and remain healthy during a deployment.
   *
   * @default - 0 if daemon, otherwise 50
   */
  readonly minHealthyPercent?: number;

  /**
   * The application load balancer that will serve traffic to the service.
   * The VPC attribute of a load balancer must be specified for it to be used
   * to create a new service with this pattern.
   *
   * [disable-awslint:ref-via-interface]
   *
   * @default - a new load balancer will be created.
   */
  readonly loadBalancer?: IApplicationLoadBalancer;

  /**
   * Listener port of the application load balancer that will serve traffic to the service.
   *
   * @default - The default listener port is determined from the protocol (port 80 for HTTP,
   * port 443 for HTTPS). A domain name and zone must be also be specified if using HTTPS.
   */
  readonly listenerPort?: number;

  /**
   * The security policy that defines which ciphers and protocols are supported by the ALB Listener.
   *
   * @default - The recommended elastic load balancing security policy
   */
  readonly sslPolicy?: SslPolicy;

  /**
   * Specifies whether to propagate the tags from the task definition or the service to the tasks in the service.
   * Tags can only be propagated to the tasks within the service during service creation.
   *
   * @default - none
   */
  readonly propagateTags?: PropagatedTagSource;

  /**
   * Specifies whether to enable Amazon ECS managed tags for the tasks within the service. For more information, see
   * [Tagging Your Amazon ECS Resources](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-using-tags.html)
   *
   * @default false
   */
  readonly enableECSManagedTags?: boolean;

  /**
   * The options for configuring an Amazon ECS service to use service discovery.
   *
   * @default - AWS Cloud Map service discovery is not enabled.
   */
  readonly cloudMapOptions?: CloudMapOptions;

  /**
   * Specifies whether the load balancer should redirect traffic on port 80 to the {@link listenerPort} to support HTTP->HTTPS redirects.
   * This is only valid if the protocol of the ALB is HTTPS.
   *
   * @default false
   */
  readonly redirectHTTP?: boolean;

  /**
   * Specifies whether the Route53 record should be a CNAME, an A record using the Alias feature or no record at all.
   * This is useful if you need to work with DNS systems that do not support alias records.
   *
   * @default ApplicationLoadBalancedServiceRecordType.ALIAS
   */
  readonly recordType?: ApplicationLoadBalancedServiceRecordType;

  /**
   * Specifies which deployment controller to use for the service. For more information, see
   * [Amazon ECS Deployment Types](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-types.html)
   *
   * @default - Rolling update (ECS)
   */
  readonly deploymentController?: DeploymentController;

  /**
   * Whether to enable the deployment circuit breaker. If this property is defined, circuit breaker will be implicitly
   * enabled.
   * @default - disabled
   */
  readonly circuitBreaker?: DeploymentCircuitBreaker;

  /**
   * A list of Capacity Provider strategies used to place a service.
   *
   * @default - undefined
   *
   */
  readonly capacityProviderStrategies?: CapacityProviderStrategy[];

  /**
   * Name of the load balancer
   *
   * @default - Automatically generated name.
   */
  readonly loadBalancerName?: string;

  /**
   * Whether ECS Exec should be enabled
   *
   * @default - false
   */
  readonly enableExecuteCommand?: boolean;

  /**
   * The load balancer idle timeout, in seconds. Can be between 1 and 4000 seconds
   *
   * @default - CloudFormation sets idle timeout to 60 seconds
   */
  readonly idleTimeout?: Duration;

  /**
   * The type of IP address to use
   *
   * @default - IpAddressType.IPV4
   */
  readonly ipAddressType?: IpAddressType;
}

export interface ApplicationLoadBalancedTaskImageOptions {
  /**
   * The image used to start a container. Image or taskDefinition must be specified, not both.
   *
   * @default - none
   */
  readonly image: ContainerImage;

  /**
   * The environment variables to pass to the container.
   *
   * @default - No environment variables.
   */
  readonly environment?: { [key: string]: string };

  /**
   * The secret to expose to the container as an environment variable.
   *
   * @default - No secret environment variables.
   */
  readonly secrets?: { [key: string]: Secret };

  /**
   * Flag to indicate whether to enable logging.
   *
   * @default true
   */
  readonly enableLogging?: boolean;

  /**
   * The log driver to use.
   *
   * @default - AwsLogDriver if enableLogging is true
   */
  readonly logDriver?: LogDriver;

  /**
   * The name of the task execution IAM role that grants the Amazon ECS container agent permission to call AWS APIs on your behalf.
   *
   * @default - No value
   */
  readonly executionRole?: IRole;

  /**
   * The name of the task IAM role that grants containers in the task permission to call AWS APIs on your behalf.
   *
   * @default - A task role is automatically created for you.
   */
  readonly taskRole?: IRole;

  /**
   * The container name value to be specified in the task definition.
   *
   * @default - none
   */
  readonly containerName?: string;

  /**
   * The port number on the container that is bound to the user-specified or automatically assigned host port.
   *
   * If you are using containers in a task with the awsvpc or host network mode, exposed ports should be specified using containerPort.
   * If you are using containers in a task with the bridge network mode and you specify a container port and not a host port,
   * your container automatically receives a host port in the ephemeral port range.
   *
   * Port mappings that are automatically assigned in this way do not count toward the 100 reserved ports limit of a container instance.
   *
   * For more information, see
   * [hostPort](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_PortMapping.html#ECS-Type-PortMapping-hostPort).
   *
   * @default 80
   */
  readonly containerPort?: number;

  /**
   * The name of a family that this task definition is registered to. A family groups multiple versions of a task definition.
   *
   * @default - Automatically generated name.
   */
  readonly family?: string;

  /**
   * A key/value map of labels to add to the container.
   *
   * @default - No labels.
   */
  readonly dockerLabels?: { [key: string]: string };

  /**
   * The entry point that's passed to the container.
   *
   * This parameter maps to `Entrypoint` in the [Create a container](https://docs.docker.com/engine/api/v1.38/#operation/ContainerCreate) section
   * of the [Docker Remote API](https://docs.docker.com/engine/api/v1.38/) and the `--entrypoint` option to
   * [docker run](https://docs.docker.com/engine/reference/commandline/run/).
   *
   * For more information about the Docker `ENTRYPOINT` parameter, see https://docs.docker.com/engine/reference/builder/#entrypoint.
   *
   * @default none
   */
  readonly entryPoint?: string[];

  /**
   * The command that's passed to the container. If there are multiple arguments, make sure that each argument is a separated string in the array.
   *
   * This parameter maps to `Cmd` in the [Create a container](https://docs.docker.com/engine/api/v1.38/#operation/ContainerCreate) section
   * of the [Docker Remote API](https://docs.docker.com/engine/api/v1.38/) and the `COMMAND` parameter to
   * [docker run](https://docs.docker.com/engine/reference/commandline/run/).
   *
   * For more information about the Docker `CMD` parameter, see https://docs.docker.com/engine/reference/builder/#cmd.
   *
   * @default none
   */
  readonly command?: string[];
}

/**
 * The base class for ApplicationLoadBalancedEc2Service and ApplicationLoadBalancedFargateService services.
 */
export abstract class ApplicationLoadBalancedServiceBase extends Construct {
  /**
   * The desired number of instantiations of the task definition to keep running on the service.
   * @deprecated - Use `internalDesiredCount` instead.
   */
  public readonly desiredCount: number;

  /**
   * The desired number of instantiations of the task definition to keep running on the service.
   * The default is 1 for all new services and uses the existing services desired count
   * when updating an existing service if one is not provided.
   */
  public readonly internalDesiredCount?: number;

  /**
   * The Application Load Balancer for the service.
   */
  public get loadBalancer(): ApplicationLoadBalancer {
    if (!this._applicationLoadBalancer) {
      throw new ValidationError('.loadBalancer can only be accessed if the class was constructed with an owned, not imported, load balancer', this);
    }
    return this._applicationLoadBalancer;
  }

  /**
   * The listener for the service.
   */
  public readonly listener: ApplicationListener;

  /**
   * The redirect listener for the service if redirectHTTP is enabled.
   */
  public readonly redirectListener?: ApplicationListener;

  /**
   * The target group for the service.
   */
  public readonly targetGroup: ApplicationTargetGroup;

  /**
   * Certificate Manager certificate to associate with the load balancer.
   */
  public readonly certificate?: ICertificate;

  /**
   * The cluster that hosts the service.
   */
  public readonly cluster: ICluster;

  private readonly _applicationLoadBalancer?: ApplicationLoadBalancer;

  /**
   * Constructs a new instance of the ApplicationLoadBalancedServiceBase class.
   */
  constructor(scope: Construct, id: string, props: ApplicationLoadBalancedServiceBaseProps = {}) {
    super(scope, id);

    if (props.cluster && props.vpc) {
      throw new ValidationError('You can only specify either vpc or cluster. Alternatively, you can leave both blank', this);
    }
    this.cluster = props.cluster || this.getDefaultCluster(this, props.vpc);

    if (props.desiredCount !== undefined && !Token.isUnresolved(props.desiredCount) && props.desiredCount < 1) {
      throw new ValidationError('You must specify a desiredCount greater than 0', this);
    }

    this.desiredCount = props.desiredCount || 1;
    this.internalDesiredCount = props.desiredCount;

    const internetFacing = props.publicLoadBalancer ?? true;

    if (props.idleTimeout) {
      const idleTimeout = props.idleTimeout.toSeconds();
      if (idleTimeout > Duration.seconds(4000).toSeconds() || idleTimeout < Duration.seconds(1).toSeconds()) {
        throw new ValidationError('Load balancer idle timeout must be between 1 and 4000 seconds.', this);
      }
    }

    const lbProps: ApplicationLoadBalancerProps = {
      vpc: this.cluster.vpc,
      loadBalancerName: props.loadBalancerName,
      internetFacing,
      idleTimeout: props.idleTimeout,
      ipAddressType: props.ipAddressType,
    };

    const loadBalancer = props.loadBalancer ?? new ApplicationLoadBalancer(this, 'LB', lbProps);

    if (props.certificate !== undefined && props.protocol !== undefined && props.protocol !== ApplicationProtocol.HTTPS) {
      throw new ValidationError('The HTTPS protocol must be used when a certificate is given', this);
    }
    const protocol = props.protocol ?? (props.certificate ? ApplicationProtocol.HTTPS : ApplicationProtocol.HTTP);

    if (protocol !== ApplicationProtocol.HTTPS && props.redirectHTTP === true) {
      throw new ValidationError('The HTTPS protocol must be used when redirecting HTTP traffic', this);
    }

    const targetProps: AddApplicationTargetsProps = {
      protocol: props.targetProtocol ?? ApplicationProtocol.HTTP,
      protocolVersion: props.protocolVersion,
    };

    this.listener = loadBalancer.addListener('PublicListener', {
      protocol,
      port: props.listenerPort,
      open: props.openListener ?? true,
      sslPolicy: props.sslPolicy,
    });
    this.targetGroup = this.listener.addTargets('ECS', targetProps);

    if (protocol === ApplicationProtocol.HTTPS) {
      if (props.certificate !== undefined) {
        this.certificate = props.certificate;
      } else {
        if (typeof props.domainName === 'undefined' || typeof props.domainZone === 'undefined') {
          throw new ValidationError('A domain name and zone is required when using the HTTPS protocol', this);
        }

        this.certificate = new Certificate(this, 'Certificate', {
          domainName: props.domainName,
          validation: CertificateValidation.fromDns(props.domainZone),
        });
      }
    }
    if (this.certificate !== undefined) {
      this.listener.addCertificates('Arns', [ListenerCertificate.fromCertificateManager(this.certificate)]);
    }
    if (props.redirectHTTP) {
      this.redirectListener = loadBalancer.addListener('PublicRedirectListener', {
        protocol: ApplicationProtocol.HTTP,
        port: 80,
        open: props.openListener ?? true,
        defaultAction: ListenerAction.redirect({
          port: props.listenerPort?.toString() || '443',
          protocol: ApplicationProtocol.HTTPS,
          permanent: true,
        }),
      });
      // Ensure the redirect listener is created after the main listener,
      // otherwise we run into a race condition that adds 2 listeners on port 80.
      this.redirectListener.node.addDependency(this.listener);
    }

    let domainName = loadBalancer.loadBalancerDnsName;
    if (typeof props.domainName !== 'undefined') {
      if (typeof props.domainZone === 'undefined') {
        throw new ValidationError('A Route53 hosted domain zone name is required to configure the specified domain name', this);
      }

      switch (props.recordType ?? ApplicationLoadBalancedServiceRecordType.ALIAS) {
        case ApplicationLoadBalancedServiceRecordType.ALIAS:
          let aliasRecord = new ARecord(this, 'DNS', {
            zone: props.domainZone,
            recordName: props.domainName,
            target: RecordTarget.fromAlias(new LoadBalancerTarget(loadBalancer)),
          });
          domainName = aliasRecord.domainName;
          break;
        case ApplicationLoadBalancedServiceRecordType.CNAME:
          let cnameRecord = new CnameRecord(this, 'DNS', {
            zone: props.domainZone,
            recordName: props.domainName,
            domainName: loadBalancer.loadBalancerDnsName,
          });
          domainName = cnameRecord.domainName;
          break;
        case ApplicationLoadBalancedServiceRecordType.NONE:
          // Do not create a DNS record
          break;
      }
    }

    if (loadBalancer instanceof ApplicationLoadBalancer) {
      this._applicationLoadBalancer = loadBalancer;
    }

    new CfnOutput(this, 'LoadBalancerDNS', { value: loadBalancer.loadBalancerDnsName });
    new CfnOutput(this, 'ServiceURL', { value: protocol.toLowerCase() + '://' + domainName });
  }

  /**
   * Returns the default cluster.
   */
  protected getDefaultCluster(scope: Construct, vpc?: IVpc): Cluster {
    // magic string to avoid collision with user-defined constructs
    const DEFAULT_CLUSTER_ID = `EcsDefaultClusterMnL3mNNYN${vpc ? vpc.node.id : ''}`;
    const stack = Stack.of(scope);
    return stack.node.tryFindChild(DEFAULT_CLUSTER_ID) as Cluster || new Cluster(stack, DEFAULT_CLUSTER_ID, { vpc });
  }

  /**
   * Adds service as a target of the target group.
   */
  protected addServiceAsTarget(service: BaseService) {
    this.targetGroup.addTarget(service);
  }

  protected createAWSLogDriver(prefix: string): AwsLogDriver {
    return new AwsLogDriver({ streamPrefix: prefix });
  }
}
