import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import maplibregl, { LngLatLike, CustomLayerInterface } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import projectInformation from "./components/Panels/ProjectInformation";
import elementData from "./components/Panels/Selection";
import settings from "./components/Panels/Settings";
import load from "./components/Toolbars/Sections/Import";
import help from "./components/Panels/Help";
import camera from "./components/Toolbars/Sections/Camera";
import measurement from "./components/Toolbars/Sections/Measurement";
import selection from "./components/Toolbars/Sections/Selection";
import { AppManager } from "./bim-components";

BUI.Manager.init();

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();
world.name = "Main";

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`
    <bim-viewport>
      <bim-grid floating></bim-grid>
    </bim-viewport>
  `;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
const { postproduction } = world.renderer;

world.camera = new OBC.OrthoPerspectiveCamera(components);

const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0x424242);
worldGrid.material.uniforms.uSize1.value = 2;
worldGrid.material.uniforms.uSize2.value = 8;

const resizeWorld = () => {
  world.renderer?.resize();
  world.camera.updateAspect();
};

viewport.addEventListener("resize", resizeWorld);

components.init();

postproduction.enabled = true;
postproduction.customEffects.excludedMeshes.push(worldGrid.three);
postproduction.setPasses({ custom: true, ao: true, gamma: true });
postproduction.customEffects.lineColor = 0x17191c;

const appManager = components.get(AppManager);
const viewportGrid = viewport.querySelector<BUI.Grid>("bim-grid[floating]")!;
appManager.grids.set("viewport", viewportGrid);

const fragments = components.get(OBC.FragmentsManager);
const indexer = components.get(OBC.IfcRelationsIndexer);
const classifier = components.get(OBC.Classifier);
classifier.list.CustomSelections = {};

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup();

const tilesLoader = components.get(OBF.IfcStreamer);
tilesLoader.url = "../resources/tiles/";
tilesLoader.world = world;
tilesLoader.culler.threshold = 10;
tilesLoader.culler.maxHiddenTime = 1000;
tilesLoader.culler.maxLostTime = 40000;

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });
highlighter.zoomToSelection = true;

const culler = components.get(OBC.Cullers).create(world);
culler.threshold = 5;

world.camera.controls.restThreshold = 0.25;
world.camera.controls.addEventListener("rest", () => {
  culler.needsUpdate = true;
  tilesLoader.culler.needsUpdate = true;
});

fragments.onFragmentsLoaded.add(async (model) => {
  if (model.hasProperties) {
    await indexer.process(model);
    classifier.byEntity(model);
  }

  for (const fragment of model.items) {
    world.meshes.add(fragment.mesh);
    culler.add(fragment.mesh);
  }

  world.scene.three.add(model);
  setTimeout(async () => {
    world.camera.fit(world.meshes, 0.8);
  }, 50);
});

fragments.onFragmentsDisposed.add(({ fragmentIDs }) => {
  for (const fragmentID of fragmentIDs) {
    const mesh = [...world.meshes].find((mesh) => mesh.uuid === fragmentID);
    if (mesh) world.meshes.delete(mesh);
  }
});

const projectInformationPanel = projectInformation(components);
const elementDataPanel = elementData(components);

const app = document.getElementById("app") as BUI.Grid;
const toggleMap = () => {
  if (app.layout === "map") {
    app.layout = "main";
  } else {
    for (const [_, model] of fragments.groups.entries()) {
      fragments.disposeGroup(model);
    }
    app.layout = "map";
  }
};

const mapSection = BUI.Component.create<BUI.ToolbarSection>(() => {
  return BUI.html`
   <bim-toolbar-section label="Map Libre">
    <bim-button label='View Map' id="mapButton" icon="simple-icons:homeadvisor" @click="${toggleMap}">
    </bim-button>
   </bim-toolbar-section>
  `;
});

// const toolbar = BUI.Component.create(() => {
//   return BUI.html`
//     <bim-toolbar>
//       ${load(components)}
//       ${camera(world)}
//       ${selection(components, world)}
//       ${mapSection}
//     </bim-toolbar>
//   `;
// });

const leftPanel = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs switchers-full>
      <bim-tab name="project" label="Project" icon="ph:building-fill">
        ${projectInformationPanel}
      </bim-tab>
      <bim-tab name="settings" label="Settings" icon="solar:settings-bold">
        ${settings(components)}
      </bim-tab>
      <bim-tab name="help" label="Help" icon="material-symbols:help">
        ${help}
      </bim-tab>
    </bim-tabs> 
  `;
});

const toolbar = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs floating style="justify-self: center; border-radius: 0.5rem;">
      <bim-tab label="Import">
        <bim-toolbar>
          ${load(components)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Selection">
        <bim-toolbar>
          ${camera(world)}
          ${selection(components, world)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Measurement">
        <bim-toolbar>
            ${measurement(world, components)}
        </bim-toolbar>      
      </bim-tab>
      <bim-tab label="Map">
        <bim-toolbar>
          ${mapSection}
        </bim-toolbar>      
      </bim-tab>
    </bim-tabs>
  `;
});



const map = document.getElementById("map") as HTMLDivElement;

app.layouts = {
  main: {
    template: `
      "leftPanel viewport" 1fr
      /26rem 1fr
    `,
    elements: {
      leftPanel,
      viewport,
    },
  },
  map: {
    template: `
      "map"
    `,
    elements: {
      map,
    },
  },
};

app.layout = "main";

viewportGrid.layouts = {
  main: {
    template: `
      "empty" 1fr
      "toolbar" auto
      /1fr
    `,
    elements: { toolbar },
  },
  second: {
    template: `
      "empty elementDataPanel" 1fr
      "toolbar elementDataPanel" auto
      /1fr 24rem
    `,
    elements: {
      toolbar,
      elementDataPanel,
    },
  },
};

viewportGrid.layout = "main";
const coords: LngLatLike = [-75.602267, 6.206761];

const APIKEY = import.meta.env.VITE_APIKEY;
// "https://api.maptiler.com/maps/basic-v2/style.json?key=?key=${APIKEY}"
const mapLibre = new maplibregl.Map({
  container: "map",
  style:
    "https://api.maptiler.com/maps/basic-v2/style.json?key=gTFdxUxy3jwhiPssAZmY",
  center: coords,
  zoom: 18,
  pitch: 45,
  bearing: -17.6,
});

const modelAltitude = 20;
const modelRotate = [Math.PI / 2, 0.75, 0];
const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
  coords,
  modelAltitude,
);

const modelTransform = {
  translateX: modelAsMercatorCoordinate.x,
  translateY: modelAsMercatorCoordinate.y,
  translateZ: modelAsMercatorCoordinate.z,
  rotateX: modelRotate[0],
  rotateY: modelRotate[1],
  rotateZ: modelRotate[2],
  scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * 100,
};


const layerCamera = new THREE.Camera();
const layerScene = new THREE.Scene();
const layerRenderer = new THREE.WebGLRenderer({
  canvas: mapLibre.getCanvas(),
  context: mapLibre.getCanvas().getContext("webgl") as WebGLRenderingContext,
  antialias: true,
  alpha: true,
});

const customLayer: CustomLayerInterface = {
  id: "3dmodel",
  type: "custom",
  renderingMode: "3d",
  onAdd() {
    const directionalLight = new THREE.DirectionalLight(0xffffff);
    directionalLight.position.set(0, -70, 100).normalize();
    layerScene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff);
    directionalLight2.position.set(0, 70, 100).normalize();
    layerScene.add(directionalLight2);

    const loader = new GLTFLoader();

    loader.load("../02_MapLibre/building.glb", (gltf) => {
      layerScene.add(gltf.scene);
    });

    layerRenderer.autoClear = false;
  },
  render(_, matrix) {
    const rotationX = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(1, 0, 0),
      modelTransform.rotateX,
    );
    const rotationY = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 1, 0),
      modelTransform.rotateY,
    );
    const rotationZ = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 0, 1),
      modelTransform.rotateZ,
    );

    const projectionMatrix = new THREE.Matrix4().fromArray(matrix);

    const transformationMatrix = new THREE.Matrix4()
      .makeTranslation(
        modelTransform.translateX,
        modelTransform.translateY,
        modelTransform.translateZ,
      )
      .scale(
        new THREE.Vector3(
          modelTransform.scale,
          -modelTransform.scale,
          modelTransform.scale,
        ),
      )
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    layerCamera.projectionMatrix =
      projectionMatrix.multiply(transformationMatrix);
    layerRenderer.resetState();
    layerRenderer.render(layerScene, layerCamera);
    mapLibre.triggerRepaint();
  },
};

mapLibre.on("style.load", () => {
  mapLibre.addLayer(customLayer);
});

mapLibre.on("load", async () => {
  const image = await mapLibre.loadImage(
    "https://maplibre.org/maplibre-gl-js/docs/assets/custom_marker.png",
  );

  mapLibre.addImage("custom-marker", image.data);

  mapLibre.addSource("mymodel", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: coords,
      },
      properties: {},
    },
  });

  mapLibre.addLayer({
    id: "mymodel",
    type: "symbol",
    source: "mymodel",
    layout: {
      "icon-image": "custom-marker",
      "icon-overlap": "always",
    },
  });

  mapLibre.on("click", "mymodel", async () => {
    const file = await fetch("../02_MapLibre/NAV-IPI-ET1_E03-ZZZ-M3D-EST.ifc");
    const data = await file.arrayBuffer();
    const buffer = new Uint8Array(data);
    await ifcLoader.load(buffer);

    toggleMap();
  });

  mapLibre.on("mouseenter", "mymodel", () => {
    mapLibre.getCanvas().style.cursor = "pointer";
  });

  mapLibre.on("mouseleave", "mymodel", () => {
    mapLibre.getCanvas().style.cursor = "";
  });
});
