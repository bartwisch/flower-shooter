/* eslint-disable sort-imports */
/**
 * Multiplayer system for real-time presence sync and basic planting replication
 */

import * as THREE from 'three';
import { Not, System } from 'ecsy';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlantGrowingComponent } from '../../components/PlantingComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import { Networked } from '../../components/Networked';
import { NetworkedPlayerComponent } from '../../components/multiplayer/NetworkedPlayerComponent';
import { TransportWebSocket } from '../../lib/net/TransportWebSocket';
import { getOnlyEntity } from '../../utils/entityUtils';

export class MultiplayerSystem extends System {
	constructor(world, attributes) {
		super(world, attributes);
		this.isEnabled = false;
		this.transport = null;
		this.clientId = null;
		this.room = 'default';
		this.remotePlayers = new Map();
		this.lastSnapshotTime = 0;
		this.snapshotInterval = 50; // 20Hz
		this.localPlayerEntity = null;
		this.scene = null;
	}

	init() {
		this.checkMultiplayerEnabled();
		if (!this.isEnabled) return;
		this.clientId = this.generateClientId();
		this.room = this.getRoom();
		const serverUrl = this.getServerUrl();
		this.transport = new TransportWebSocket(serverUrl);
		this.setupTransportListeners();
		this.transport.connect();
	}

	checkMultiplayerEnabled() {
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('mp') === '1') {
			this.isEnabled = true;
			return;
		}
		if (localStorage.getItem('pfb:mp') === '1') {
			this.isEnabled = true;
			return;
		}
		if (typeof window !== 'undefined' && window.__MULTIPLAYER_ENABLED__) {
			this.isEnabled = true;
			return;
		}
		this.isEnabled = false;
	}

	getServerUrl() {
		if (typeof window !== 'undefined' && window.__MULTIPLAYER_SERVER_URL__) {
			return window.__MULTIPLAYER_SERVER_URL__;
		}
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.hostname;
		const port = window.location.hostname === 'localhost' ? 8090 : window.location.port;
		return `${protocol}//${host}:${port}`;
	}

	getRoom() {
		const urlParams = new URLSearchParams(window.location.search);
		return urlParams.get('room') || 'default';
	}

	generateClientId() {
		return 'pfb_' + Math.random().toString(36).slice(2, 8) + '_' + Date.now().toString(36);
	}

	setupTransportListeners() {
		this.transport.on('open', () => {
			this.transport.send({ v: 1, type: 'hello', clientId: this.clientId, room: this.room });
		});
		this.transport.on('message', (message) => this.handleMessage(message));
	}

	handleMessage(message) {
		const { type } = message;
		switch (type) {
			case 'hello_ack':
				break;
			case 'join':
				this.handlePlayerJoin(message);
				break;
			case 'leave':
				this.handlePlayerLeave(message);
				break;
			case 'snapshot':
				this.handleSnapshot(message);
				break;
			case 'event:plant':
				this.handleRemotePlantEvent(message);
				break;
			default:
				break;
		}
	}

	handlePlayerJoin({ clientId }) {
		if (clientId === this.clientId) return;
		if (!this.remotePlayers.has(clientId)) this.createRemotePlayer(clientId);
	}

	handlePlayerLeave({ clientId }) {
		if (clientId === this.clientId) return;
		this.removeRemotePlayer(clientId);
	}

	handleSnapshot(message) {
		const { clientId } = message;
		if (clientId === this.clientId) return;
		let remotePlayerEntity = this.remotePlayers.get(clientId);
		if (!remotePlayerEntity) remotePlayerEntity = this.createRemotePlayer(clientId);
		this.updateRemotePlayerTransform(remotePlayerEntity, message);
	}

	handleRemotePlantEvent({ clientId, plantType, pos, quat }) {
		if (clientId === this.clientId) return;
		if (!this.scene) this.scene = getOnlyEntity(this.queries.threeGlobal).getComponent(THREEGlobalComponent).scene;
		const obj = new THREE.Object3D();
		obj.position.set(pos.x, pos.y, pos.z);
		obj.quaternion.set(quat.x, quat.y, quat.z, quat.w);
		this.scene.add(obj);
		const e = this.world.createEntity();
		e.addComponent(Object3DComponent, { value: obj });
		e.addComponent(PlantGrowingComponent, { plantType });
		e.addComponent(Networked);
	}

	createRemotePlayer(clientId) {
		if (!this.scene) this.scene = getOnlyEntity(this.queries.threeGlobal).getComponent(THREEGlobalComponent).scene;
		const entity = this.world.createEntity();
		const headGeometry = new THREE.CapsuleGeometry(0.1, 0.15, 8, 16);
		const headMaterial = new THREE.MeshBasicMaterial({ color: 0x4caf50 });
		const headMesh = new THREE.Mesh(headGeometry, headMaterial);
		const handGeometry = new THREE.SphereGeometry(0.05, 8, 6);
		const handMaterial = new THREE.MeshBasicMaterial({ color: 0x2196f3 });
		const leftHandMesh = new THREE.Mesh(handGeometry, handMaterial);
		const rightHandMesh = new THREE.Mesh(handGeometry, handMaterial);
		const headGroup = new THREE.Group();
		const leftHandGroup = new THREE.Group();
		const rightHandGroup = new THREE.Group();
		headGroup.add(headMesh);
		leftHandGroup.add(leftHandMesh);
		rightHandGroup.add(rightHandMesh);
		this.scene.add(headGroup);
		this.scene.add(leftHandGroup);
		this.scene.add(rightHandGroup);
		entity.addComponent(NetworkedPlayerComponent, {
			clientId,
			headGroup,
			leftHandGroup,
			rightHandGroup,
			targetHeadPosition: new THREE.Vector3(),
			targetHeadRotation: new THREE.Quaternion(),
			targetLeftHandPosition: new THREE.Vector3(),
			targetLeftHandRotation: new THREE.Quaternion(),
			targetRightHandPosition: new THREE.Vector3(),
			targetRightHandRotation: new THREE.Quaternion(),
		});
		this.remotePlayers.set(clientId, entity);
		return entity;
	}

	removeRemotePlayer(clientId) {
		const entity = this.remotePlayers.get(clientId);
		if (!entity) return;
		const c = entity.getComponent(NetworkedPlayerComponent);
		if (c) {
			this.scene.remove(c.headGroup);
			this.scene.remove(c.leftHandGroup);
			this.scene.remove(c.rightHandGroup);
			[c.headGroup, c.leftHandGroup, c.rightHandGroup].forEach((g) => {
				g.traverse((child) => {
					if (child.isMesh) {
						child.geometry.dispose();
						if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
						else child.material.dispose();
					}
				});
			});
		}
		entity.remove();
		this.remotePlayers.delete(clientId);
	}

	updateRemotePlayerTransform(entity, snapshot) {
		const c = entity.getMutableComponent(NetworkedPlayerComponent);
		const { head, lh, rh, t } = snapshot;
		if (head) {
			c.targetHeadPosition.set(head.p.x, head.p.y, head.p.z);
			c.targetHeadRotation.set(head.q.x, head.q.y, head.q.z, head.q.w);
		}
		if (lh) {
			c.targetLeftHandPosition.set(lh.p.x, lh.p.y, lh.p.z);
			c.targetLeftHandRotation.set(lh.q.x, lh.q.y, lh.q.z, lh.q.w);
		}
		if (rh) {
			c.targetRightHandPosition.set(rh.p.x, rh.p.y, rh.p.z);
			c.targetRightHandRotation.set(rh.q.x, rh.q.y, rh.q.z, rh.q.w);
		}
		c.lastSnapshotTime = t || Date.now();
	}

	execute(delta, time) {
		if (!this.isEnabled || !this.transport || !this.transport.isConnected) return;
		// Publish local player snapshot
		this.publishSnapshot(time);
		// Interpolate remote players
		const lerpSpeed = 10 * delta;
		this.queries.remotePlayers.results.forEach((e) => {
			const c = e.getMutableComponent(NetworkedPlayerComponent);
			c.headGroup.position.lerp(c.targetHeadPosition, lerpSpeed);
			c.headGroup.quaternion.slerp(c.targetHeadRotation, lerpSpeed);
			c.leftHandGroup.position.lerp(c.targetLeftHandPosition, lerpSpeed);
			c.leftHandGroup.quaternion.slerp(c.targetLeftHandRotation, lerpSpeed);
			c.rightHandGroup.position.lerp(c.targetRightHandPosition, lerpSpeed);
			c.rightHandGroup.quaternion.slerp(c.targetRightHandRotation, lerpSpeed);
		});
		// Broadcast local newly planted plants (avoid echoes with Networked tag)
		this.queries.newlyPlanted.added.forEach((entity) => {
			const plant = entity.getComponent(PlantGrowingComponent);
			const obj = entity.getComponent(Object3DComponent).value;
			this.transport.send({
				v: 1,
				type: 'event:plant',
				plantType: plant.plantType,
				pos: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
				quat: { x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w },
				t: Date.now(),
			});
		});
	}

	publishSnapshot(time) {
		if (time - this.lastSnapshotTime < this.snapshotInterval) return;
		if (!this.localPlayerEntity) this.localPlayerEntity = getOnlyEntity(this.queries.localPlayer);
		if (!this.localPlayerEntity) return;
		const playerState = this.localPlayerEntity.getComponent(PlayerStateComponent);
		if (!playerState) return;
		// Read controllers
		let left = null;
		let right = null;
		this.queries.controllers.results.forEach((e) => {
			const vr = e.getComponent(VrControllerComponent);
			if (vr.handedness === 'left') left = vr.controllerInterface?.controllerModel;
			if (vr.handedness === 'right') right = vr.controllerInterface?.controllerModel;
		});
		if (!left || !right) return;
		this.transport.send({
			v: 1,
			type: 'snapshot',
			t: time,
			head: { p: playerState.playerHead.position, q: playerState.playerHead.quaternion },
			lh: { p: left.position, q: left.quaternion },
			rh: { p: right.position, q: right.quaternion },
		});
		this.lastSnapshotTime = time;
	}

	onStop() {
		if (this.transport) this.transport.disconnect();
		this.remotePlayers.forEach((_, id) => this.removeRemotePlayer(id));
	}
}

MultiplayerSystem.queries = {
	localPlayer: { components: [PlayerStateComponent] },
	controllers: { components: [VrControllerComponent] },
	remotePlayers: { components: [NetworkedPlayerComponent] },
	threeGlobal: { components: [THREEGlobalComponent] },
	newlyPlanted: {
		components: [PlantGrowingComponent, Object3DComponent, Not(Networked)],
		listen: { added: true },
	},
};

/* eslint-enable sort-imports */
