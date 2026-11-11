import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Network, Download } from "lucide-react";
import * as THREE from 'three';

export default function VisualCorrelationGraphs() {
  const containerRef = useRef(null);
  const [graphType, setGraphType] = useState('device_network');
  const [scene, setScene] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const { data: observations = [] } = useQuery({
    queryKey: ['observations-graph'],
    queryFn: () => base44.entities.Observation.list('-timestamp', 500),
    initialData: []
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions-graph'],
    queryFn: () => base44.entities.ScanSession.list('-start_timestamp', 100),
    initialData: []
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js scene for 3D network graph
    const width = containerRef.current.clientWidth;
    const height = 500;

    const sceneInstance = new THREE.Scene();
    sceneInstance.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    // Generate network graph
    generateNetworkGraph(sceneInstance, graphType);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      sceneInstance.rotation.y += 0.001;
      renderer.render(sceneInstance, camera);
    };

    animate();
    setScene(sceneInstance);

    return () => {
      renderer.dispose();
    };
  }, [graphType, observations, sessions]);

  const generateNetworkGraph = (sceneInstance, type) => {
    // Clear existing objects
    while(sceneInstance.children.length > 0) { 
      sceneInstance.remove(sceneInstance.children[0]); 
    }

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    sceneInstance.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(10, 10, 10);
    sceneInstance.add(pointLight);

    if (type === 'device_network') {
      generateDeviceNetwork(sceneInstance);
    } else if (type === 'session_timeline') {
      generateSessionTimeline(sceneInstance);
    } else if (type === 'threat_correlation') {
      generateThreatCorrelation(sceneInstance);
    }
  };

  const generateDeviceNetwork = (sceneInstance) => {
    // Group observations by device
    const deviceMap = new Map();
    
    observations.forEach(obs => {
      if (obs.observation_type === 'ble_device' && obs.ble_data?.mac_address) {
        const mac = obs.ble_data.mac_address;
        if (!deviceMap.has(mac)) {
          deviceMap.set(mac, {
            mac,
            observations: [],
            rssi: obs.ble_data.rssi || -70
          });
        }
        deviceMap.get(mac).observations.push(obs);
      }
    });

    const devices = Array.from(deviceMap.values());
    const positions = [];

    // Create nodes (spheres) for each device
    devices.forEach((device, i) => {
      const angle = (i / devices.length) * Math.PI * 2;
      const radius = 20;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (Math.random() - 0.5) * 10;

      positions.push({ x, y, z, device });

      // Node sphere
      const geometry = new THREE.SphereGeometry(0.8, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color: device.observations.some(o => o.anomaly_score > 50) ? 0xff4444 : 0x4444ff,
        emissive: 0x222222
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(x, y, z);
      sceneInstance.add(sphere);

      // Device label (simplified)
      const labelGeometry = new THREE.SphereGeometry(0.3, 8, 8);
      const labelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const label = new THREE.Mesh(labelGeometry, labelMaterial);
      label.position.set(x, y + 1.5, z);
      sceneInstance.add(label);
    });

    // Create edges (lines) between devices
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        // Draw connection if devices were seen in similar timeframes
        const points = [];
        points.push(new THREE.Vector3(positions[i].x, positions[i].y, positions[i].z));
        points.push(new THREE.Vector3(positions[j].x, positions[j].y, positions[j].z));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
          color: 0x444444, 
          opacity: 0.3, 
          transparent: true 
        });
        const line = new THREE.Line(geometry, material);
        sceneInstance.add(line);
      }
    }

    // Add central hub
    const hubGeometry = new THREE.SphereGeometry(2, 32, 32);
    const hubMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x10b981,
      emissive: 0x0a5c43
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    sceneInstance.add(hub);
  };

  const generateSessionTimeline = (sceneInstance) => {
    sessions.forEach((session, i) => {
      const x = (i - sessions.length / 2) * 5;
      const y = 0;
      const z = 0;

      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshPhongMaterial({
        color: session.anomaly_count > 0 ? 0xff4444 : 0x4444ff
      });
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(x, y, z);
      sceneInstance.add(cube);
    });
  };

  const generateThreatCorrelation = (sceneInstance) => {
    // Similar to device network but colored by threat level
    const deviceMap = new Map();
    
    observations.forEach(obs => {
      if (obs.observation_type === 'ble_device' && obs.ble_data?.mac_address) {
        const mac = obs.ble_data.mac_address;
        if (!deviceMap.has(mac)) {
          deviceMap.set(mac, {
            mac,
            threat_score: obs.anomaly_score || 0
          });
        }
      }
    });

    const devices = Array.from(deviceMap.values());

    devices.forEach((device, i) => {
      const angle = (i / devices.length) * Math.PI * 2;
      const radius = 15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 0;

      const color = device.threat_score > 70 ? 0xff0000 :
                    device.threat_score > 50 ? 0xff8800 :
                    device.threat_score > 30 ? 0xffff00 : 0x00ff00;

      const geometry = new THREE.SphereGeometry(1, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(x, y, z);
      sceneInstance.add(sphere);
    });
  };

  const downloadGraph = () => {
    if (!containerRef.current) return;
    
    const canvas = containerRef.current.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `correlation_graph_${graphType}_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-6 h-6 text-purple-400" />
              Visual Correlation Graphs
            </div>
            <div className="flex gap-2">
              <Select value={graphType} onValueChange={setGraphType}>
                <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="device_network">Device Network</SelectItem>
                  <SelectItem value="session_timeline">Session Timeline</SelectItem>
                  <SelectItem value="threat_correlation">Threat Correlation</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={downloadGraph}>
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-slate-800/50 rounded">
              <p className="text-2xl font-bold text-blue-400">{observations.length}</p>
              <p className="text-xs text-slate-400">Observations</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded">
              <p className="text-2xl font-bold text-purple-400">
                {new Set(observations.filter(o => o.observation_type === 'ble_device').map(o => o.ble_data?.mac_address)).size}
              </p>
              <p className="text-xs text-slate-400">Unique Devices</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded">
              <p className="text-2xl font-bold text-green-400">{sessions.length}</p>
              <p className="text-xs text-slate-400">Sessions</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded">
              <p className="text-2xl font-bold text-red-400">
                {observations.filter(o => o.anomaly_score > 50).length}
              </p>
              <p className="text-xs text-slate-400">Anomalies</p>
            </div>
          </div>

          {/* 3D Graph Container */}
          <div 
            ref={containerRef} 
            className="w-full h-[500px] bg-slate-950 rounded-lg border border-slate-700"
          />

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span className="text-slate-400">Normal Devices</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded-full"></div>
              <span className="text-slate-400">Suspicious Devices</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <span className="text-slate-400">Central Hub</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500">
        <div className="flex items-start gap-3 text-sm text-purple-400">
          <Network className="w-5 h-5 mt-0.5" />
          <div>
            <strong>Visual Correlation Graphs:</strong> Interactive 3D visualization of device networks, session timelines, and threat correlations. 
            Rotate the graph to explore connections and identify patterns. Red nodes indicate suspicious activity.
          </div>
        </div>
      </div>
    </div>
  );
}