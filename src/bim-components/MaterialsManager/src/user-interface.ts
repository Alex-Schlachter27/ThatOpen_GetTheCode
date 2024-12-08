import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as WEBIFC from "web-ifc";
import { IfcMaterialsManager } from "..";

// The state is the argument a template function in the
// engine's UI system receives. 
// In the case of the materials list, is just the components
// entry point, so we can get any other component we might need
// in the future to process the materials.
interface MaterialsListState {
  components: OBC.Components;
}

// This type represents the possible columns in the materials list table.
// The modelID and materialID are used to know the material
// represented in the row and the model it belongs to.
// The Name is used to display the material, property set, or property names.
// The psetID is to know the expressID in case it is property set row.
// The Value column is to hold the current value of a property in case it is
// a property row.
// The Actions column is just a placeholder used to be transformed
// later into some other more useful HTMLElement, like buttons to create
// psets and properties.
type MaterialsTable = {
  modelID: string;
  materialID: number;
  Name: string;
  psetID: number;
  Value: string | boolean | number;
  Actions: string;
};

let newPsetModal: HTMLDialogElement;
let modelID: string | null = null;
let materialID: number | null = null;
let newPropModal: HTMLDialogElement;
let psetID: number | null = null;


// MATERIAL LIST TEMPLATE //

// The template will run the first time the UI is created and also
// at any consecutive update we trigger
const template: BUI.StatefullComponent<MaterialsListState> = (state) => {
  const { components } = state;
  // The FragmentsManager is needed in order to get all models
  // in the app, so materials can be obtained.
  const fragments = components.get(OBC.FragmentsManager);
  // The RelationsIndexer is important as we have to 
  // get all material property sets to render them in the table
  const indexer = components.get(OBC.IfcRelationsIndexer);

	// There are two ways to load data in a table: by directly setting it
	// or by defining a load function. A load function is great when data
	// has to be loaded asynchronously, and as model properties are get
	// asynchronously this is a perfect approach.
  const loadFunction: BUI.TableLoadFunction<MaterialsTable> = async () => {
	  // The most important thing in the load function is to create 
	  // the data structure need by the table to render the information.
	  // Here we will create an array of TableGroupData that uses the columns
	  // we defined in the MaterialsTable type.
    const data: BUI.TableGroupData<MaterialsTable>[] = [];
    for (const [_, model] of fragments.groups) {
	    // The model may come without materials, so we skip its processing if that's
	    // the case
      const materials = await model.getAllPropertiesOfType(WEBIFC.IFCMATERIAL);
      if (!materials) continue;
      for (const [expressID, attrs] of Object.entries(materials)) {
	      // We have decided to not process the material if it doesn't
	      // have a name.
        const name = attrs.Name?.value;
        if (!name) continue;
        // Just create a row in the table that represents the material data.
        // Then, just add it to the general table data.
        const materialRow: BUI.TableGroupData<MaterialsTable> = {
          data: {
            modelID: model.uuid,
            materialID: Number(expressID),
            Name: name,
            Actions: "",
          },
        };
        data.push(materialRow);
        // Using the indexer, we can get the property sets of the material
        const materialPsets = indexer.getEntityRelations(
          model,
          Number(expressID),
          "IsDefinedBy",
        );
        for (const psetID of materialPsets) {
          const psetAttrs = await model.getProperties(psetID);
          if (!(psetAttrs && psetAttrs.Name?.value)) continue;
          // Just as before, a table row is created to represent
          // the property set. Also, it is added to the material
          // row children, so it is display as a nested structure
          const psetRow: BUI.TableGroupData = {
            data: {
              modelID: model.uuid,
              psetID: Number(psetID),
              Name: psetAttrs.Name.value,
              Actions: "",
            },
          };
          if (!materialRow.children) materialRow.children = [];
          materialRow.children.push(psetRow);
          for (const { value: propID } of psetAttrs.HasProperties ?? []) {
            const propAttrs = await model.getProperties(propID);
            if (!propAttrs) continue;
            const name = propAttrs.Name?.value;
            const value = propAttrs.NominalValue?.value;
            if (!(name && value)) continue;
            // Lastly, a table row to display each property is created
            // and added to the property set row children.
            const propRow: BUI.TableGroupData<MaterialsTable> = {
              data: {
                Name: name,
                Value: value,
              },
            };
            if (!psetRow.children) psetRow.children = [];
            psetRow.children.push(propRow);
          }
        }
      }
    }
    // Remember to return the data, so it can be used by the table.
    return data;
  };

	// The data transform for a table determines how a column should be render
	// for each row in the table. In this case, we will transform the Actions
	// column to display some buttons in each row to create the property set
	// for materials and property for psets.
  const dataTransform: BUI.TableDataTransform<MaterialsTable> = {
    Actions: (_, rowData) => {
      if (!rowData.modelID) return "";
      // If the row data includes a material ID, is a material row.
      // In this case, a button is used to create property sets.
      if (rowData.materialID) {
	      // Its important that once the button to create the pset is clicked,
	      // the global data is set so it can be used in the form (to be created)
	      // in order to provide the correct information to the MaterialsManager
	      // component.
        const onClick = () => {
          modelID = rowData.modelID!;
          materialID = rowData.materialID!;
          newPsetModal.showModal();
        };
        return BUI.html`
          <bim-button @click=${onClick} icon="mi:add"></bim-button>
        `;
      }
      // If the row data includes a psetID, is a property set row.
      // in this case, a button is used to create properties.
      if (rowData.psetID) {
	      // Once again, is important to set the global data so it can be used
	      // in the form later on.
        const onClick = () => {
          modelID = rowData.modelID!;
          psetID = rowData.psetID!;
          newPropModal.showModal();
        };
        return BUI.html`
          <div style="display: flex; gap: 0.25rem">
            <bim-button @click=${onClick} icon="mi:add"></bim-button> 
          </div>
        `;
      }
      return _;
    },
  };

	// This callback will be executed once the table is updated.
	// Here, we just set its load function and data transform.
	// The most important thing is to tell the table to load the data.
  const onCreated = (e?: Element) => {
    if (!(e instanceof BUI.Table)) return;
    const table = e as BUI.Table<MaterialsTable>;
    table.loadFunction = loadFunction;
    table.dataTransform = dataTransform;
    table.loadData(true);
  };

  return BUI.html`<bim-table ${BUI.ref(onCreated)} headers-hidden expanded></bim-table>`;
};


// MATERIAL LIST FACTORY //

export const materialsList = (state: MaterialsListState) => {
  const { components } = state;
  // The fragments manager is used to update the table
  // each time a new model is loaded in the app.
  const fragments = components.get(OBC.FragmentsManager);

  // This is the formal creation of the list.
  // We destructure the result to get the table it-self and the
  // function to update it.
  const element = BUI.Component.create<BUI.Table, MaterialsListState>(
    template,
    state,
  );

  const [table, updateTable] = element;

  // We set some defaults for the table, like hidden columns we don't
  // want to see and the width for some of them.
  table.hiddenColumns = ["modelID", "materialID", "psetID", "propID"];
  table.columns = [
    { name: "Name", width: "15rem" },
    "Value",
    { name: "Actions", width: "auto" },
  ];

  // Each time a model is loaded, the table is updated so it can reflect
  // its materials.
  fragments.onFragmentsLoaded.add(() => updateTable());

  // Here, we set the global variable created for the pset form modal.
  newPsetModal = BUI.Component.create<HTMLDialogElement>(() => {
    const onAddClick = async (e: Event) => {
      const btn = e.target as BUI.Button;
      // Once the form is submitted, the panel section
      // where it is located is used to get the name of the pset
      // to be created
      const panelSection = btn.closest("bim-panel-section");
      const psetName = panelSection?.value.pset;
      if (!(modelID && materialID && psetName && psetName.trim() !== ""))
        return;
      // Using the modelID we get the corresponding model
      const model = fragments.groups.get(modelID);
      if (!model) return;
      // With the information in hand, we simply use the materials manager
      // component to add the pset to the material.
      const materialsManager = components.get(IfcMaterialsManager);
      await materialsManager.addMaterialPset(model, materialID, psetName);
      // It's important to update the table as there is new information
      // to be displayed (the material pset we just did).
      updateTable();
      newPsetModal.close();
    };

    return BUI.html`
    <dialog>
      <bim-panel style="width: 20rem;">
        <bim-panel-section label="New Material Pset" fixed>
          <bim-text-input name="pset" label="What is the name of your new property set?" vertical></bim-text-input> 
          <bim-button @click=${onAddClick} label="Add" icon="mi:add"></bim-button> 
        </bim-panel-section>
      </bim-panel>
    </dialog>
  `;
  });

  // As a safe choice, let's nullify some of the global values after the 
  // modal has been closed (either if the user close it or the form is submitted).
  newPsetModal.addEventListener("close", () => {
    modelID = null;
    materialID = null;
  });

  // Just as before, we create a new form modal to create properties in the psets.
  newPropModal = BUI.Component.create<HTMLDialogElement>(() => {
    const onAddClick = async (e: Event) => {
      const btn = e.target as BUI.Button;
      const panelSection = btn.closest("bim-panel-section");
      const prop = panelSection?.value.name;
      const value = panelSection?.value.value;
      console.log(panelSection?.value.type)
      const type = panelSection?.value.type[0];
      if (!(modelID && psetID && prop && value)) return;
      const model = fragments.groups.get(modelID);
      if (!model) return;
      const materialsManager = components.get(IfcMaterialsManager);
      await materialsManager.addPropToMaterialPset(model, psetID, prop, value, type);
      updateTable();
      newPropModal.close();
    };

    return BUI.html`
      <dialog>
        <bim-panel style="width: 20rem;">
          <bim-panel-section label="New Property" fixed>
            <bim-text-input name="name" label="What is the name of the new property?" vertical></bim-text-input> 
            <bim-dropdown  id="ifc-data-type-dropdown" name="type" label="What is the IFC data type?" vertical>
            
              <bim-option label="IfcPressureMeasure" vertical></bim-option>
              <bim-option label="IfcText"></bim-option>
              <bim-option label="IfcReal"></bim-option>
              <bim-option label="IfcLabel"></bim-option>
              <bim-option label="IfcInteger"></bim-option>
            </bim-dropdown> 
            <bim-text-input name="value" label="And its value?" vertical></bim-text-input> 
            <bim-button @click=${onAddClick} label="Add" icon="mi:add"></bim-button> 
          </bim-panel-section>
        </bim-panel>
      </dialog>
    `;
  });

  newPropModal.addEventListener("close", () => {
    modelID = null;
    psetID = null;
  });

  // Lastly, we add both modals to the body.
  document.body.append(newPsetModal, newPropModal);

  return element;
};