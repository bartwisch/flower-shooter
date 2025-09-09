/**
 * Component for networked remote player avatars
 */

import { Component, Types } from 'ecsy';

export class NetworkedPlayerComponent extends Component {}

NetworkedPlayerComponent.schema = {
	// Remote player identifier
	clientId: { type: Types.String, default: '' },

	// THREE.Group references for avatar visualization
	headGroup: { type: Types.Ref, default: null },
	leftHandGroup: { type: Types.Ref, default: null },
	rightHandGroup: { type: Types.Ref, default: null },

	// Interpolation targets
	targetHeadPosition: { type: Types.Ref, default: null },
	targetHeadRotation: { type: Types.Ref, default: null },
	targetLeftHandPosition: { type: Types.Ref, default: null },
	targetLeftHandRotation: { type: Types.Ref, default: null },
	targetRightHandPosition: { type: Types.Ref, default: null },
	targetRightHandRotation: { type: Types.Ref, default: null },

	// Last received snapshot timestamp
	lastSnapshotTime: { type: Types.Number, default: 0 },
};

