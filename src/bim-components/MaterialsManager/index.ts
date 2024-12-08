import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as WEBIFC from "web-ifc";

// This is a custom BIM component.
// The most important thing is it extends from OBC.Component
// so it can share some things with all the other built-in components.
export class IfcMaterialsManager extends OBC.Component {
  // BIM Components are meant to be singletones in the app.
  // That means they only exist once.
  // To allow that, a static uuid must be set for them.
  // You can create a new uuid from any valid page like uuidgenerator
  static uuid = "0f0c7c47-6a9d-478f-9f14-02370fa819c3" as const;
  enabled = false;

  constructor(components: OBC.Components) {
    super(components);
    // Is ultra important to add the component to the components entry point
    // using the designated ID. This allow you to get the instance of the 
    // MaterialsManger component anywhere you want in your app as long you
    // have access to the components entry point.
    components.add(IfcMaterialsManager.uuid, this);
  }

  // This method does exactly that, to add a pset to any material
  async addMaterialPset(
    model: FRAGS.FragmentsGroup,
    materialID: number,
    psetName: string,
  ) {
    // The indexer is needed so the pset and material can be related
    const indexer = this.components.get(OBC.IfcRelationsIndexer);
    // The properties manager is used to create a new pset.
    // However, is not actually need! You can use WEBIFC directly to
    // create the corresponding IfcPropertySet.
    const propertiesManager = this.components.get(OBC.IfcPropertiesManager);
    const { pset } = await propertiesManager.newPset(model, psetName);
    // In any case, this step is a must.
    // By setting the data, you ensure the properties not only get added
    // to the model but also a valid expressID is assigned.
    await propertiesManager.setData(model, pset);
    // As said before, the indexer is needed so the material and the pset
    // can be related using the corresponding IfcRelationship and inverse
    // attribute.
    indexer.addEntitiesRelation(
      model,
      pset.expressID,
      {
        type: WEBIFC.IFCRELDEFINESBYPROPERTIES,
        inv: "DefinesOcurrence",
      },
      materialID,
    );
    return pset;
  }

  // THis method simply adds a new property to the property set.
  async addPropToMaterialPset(
    model: FRAGS.FragmentsGroup,
    psetID: number,
    prop: string,
    value: string,
    type: string,
  ) {
    // First, it makes sense to know if the property set actually exists.
    const psetAttrs = await model.getProperties(psetID);
    if (!(psetAttrs && Array.isArray(psetAttrs.HasProperties))) return;
    const propertiesManager = this.components.get(OBC.IfcPropertiesManager);
    // The properties manager is used to create a new single string property.
    // By default the data type is always an IfcText.
    // Check the quest so you know how to allow any data type!
    // @ts-ignore
    const property = await propertiesManager.newSingleProperty(
      model,
      type,
      prop,
      value,
    );
    // Finally, the new property expressID is added to the pset HasProperties attribue.
    // The expressID must be wrapped around a Handle from WebIfc, so it can be treated
    // as a reference.
    psetAttrs.HasProperties?.push(new WEBIFC.Handle(property.expressID));
  }
}

// Optionally, you can export everything from the source folder.
export * from "./src";