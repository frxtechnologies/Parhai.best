/**
 * Cambridge O Level Chemistry 5070 — stable topic taxonomy.
 * IDs are PERMANENT once questions reference them. Never remove or rename.
 */

import type { TaxonomyTopic } from "./taxonomy-types";

export const CHEMISTRY_5070_TAXONOMY: TaxonomyTopic[] = [
  // ── Level 1 sections ──────────────────────────────────────────────────────
  { id: "chem.experimental", parent_id: null, level: 1, name: "Experimental Chemistry", keywords: ["experiment", "separation", "purity", "chromatography", "apparatus", "measurement"] },
  { id: "chem.atoms", parent_id: null, level: 1, name: "Atoms, Elements & Compounds", keywords: ["atom", "element", "compound", "structure", "bonding", "periodic table", "isotope"] },
  { id: "chem.stoichiometry", parent_id: null, level: 1, name: "Stoichiometry", keywords: ["mole", "formula", "equation", "relative mass", "concentration", "calculation"] },
  { id: "chem.reactions", parent_id: null, level: 1, name: "Chemical Reactions", keywords: ["rate of reaction", "reversible", "equilibrium", "redox", "oxidation", "reduction"] },
  { id: "chem.energetics", parent_id: null, level: 1, name: "Energy from Chemicals", keywords: ["exothermic", "endothermic", "energy", "fuel", "enthalpy", "combustion"] },
  { id: "chem.electrochemistry", parent_id: null, level: 1, name: "Electrochemistry", keywords: ["electrolysis", "electrode", "electrolyte", "cell", "ion discharge", "anode", "cathode"] },
  { id: "chem.acids", parent_id: null, level: 1, name: "Acids, Bases & Salts", keywords: ["acid", "base", "alkali", "salt", "pH", "neutralisation", "indicator"] },
  { id: "chem.periodic", parent_id: null, level: 1, name: "The Periodic Table", keywords: ["periodic table", "group", "period", "trend", "alkali metal", "halogen", "noble gas"] },
  { id: "chem.metals", parent_id: null, level: 1, name: "Metals", keywords: ["metal", "reactivity series", "extraction", "alloy", "corrosion", "rusting"] },
  { id: "chem.environment", parent_id: null, level: 1, name: "Air, Water & the Environment", keywords: ["air", "water", "pollution", "combustion", "greenhouse", "atmosphere"] },
  { id: "chem.organic", parent_id: null, level: 1, name: "Organic Chemistry", keywords: ["organic", "hydrocarbon", "alkane", "alkene", "alcohol", "polymer", "petroleum"] },

  // ── Level 2 subtopics ─────────────────────────────────────────────────────
  { id: "chem.experimental.techniques", parent_id: "chem.experimental", level: 2, name: "Separation & Purification",
    keywords: ["filtration", "crystallisation", "distillation", "fractional distillation", "chromatography", "evaporation", "decanting", "purity", "melting point", "Rf value", "solvent"] },
  { id: "chem.experimental.measurement", parent_id: "chem.experimental", level: 2, name: "Measurement & Apparatus",
    keywords: ["measuring cylinder", "burette", "pipette", "apparatus", "gas collection", "time", "volume", "mass", "thermometer"] },

  { id: "chem.atoms.structure", parent_id: "chem.atoms", level: 2, name: "Atomic Structure",
    keywords: ["proton", "neutron", "electron", "atomic number", "mass number", "isotope", "electronic configuration", "shell", "nucleus", "relative atomic mass"] },
  { id: "chem.atoms.bonding", parent_id: "chem.atoms", level: 2, name: "Chemical Bonding & Structure",
    keywords: ["ionic bond", "covalent bond", "metallic bond", "giant structure", "simple molecular", "diamond", "graphite", "dot and cross", "lattice", "intermolecular"] },

  { id: "chem.stoichiometry.formulae", parent_id: "chem.stoichiometry", level: 2, name: "Formulae & Equations",
    keywords: ["chemical formula", "balanced equation", "symbol equation", "ionic equation", "state symbols", "valency", "relative formula mass", "empirical formula"] },
  { id: "chem.stoichiometry.moles", parent_id: "chem.stoichiometry", level: 2, name: "The Mole & Calculations",
    keywords: ["mole", "Avogadro", "molar mass", "concentration", "titration calculation", "percentage yield", "percentage composition", "volume of gas", "molar volume", "limiting reagent"] },

  { id: "chem.reactions.rate", parent_id: "chem.reactions", level: 2, name: "Rate of Reaction",
    keywords: ["rate of reaction", "catalyst", "surface area", "temperature", "concentration", "collision theory", "activation energy", "enzyme"] },
  { id: "chem.reactions.reversible", parent_id: "chem.reactions", level: 2, name: "Reversible Reactions & Equilibrium",
    keywords: ["reversible reaction", "equilibrium", "dynamic equilibrium", "Le Chatelier", "Haber process", "Contact process", "forward reaction", "backward reaction"] },
  { id: "chem.reactions.redox", parent_id: "chem.reactions", level: 2, name: "Redox Reactions",
    keywords: ["redox", "oxidation", "reduction", "oxidising agent", "reducing agent", "oxidation state", "electron transfer", "OIL RIG", "oxidation number"] },

  { id: "chem.energetics.reactions", parent_id: "chem.energetics", level: 2, name: "Energy Changes & Fuels",
    keywords: ["exothermic", "endothermic", "energy profile", "activation energy", "bond breaking", "bond making", "fuel", "combustion", "enthalpy change", "temperature change"] },

  { id: "chem.electrochemistry.electrolysis", parent_id: "chem.electrochemistry", level: 2, name: "Electrolysis",
    keywords: ["electrolysis", "electrolyte", "anode", "cathode", "electrode", "ion discharge", "molten", "aqueous", "electroplating", "purification of copper", "half equation"] },
  { id: "chem.electrochemistry.cells", parent_id: "chem.electrochemistry", level: 2, name: "Cells & Reactivity",
    keywords: ["simple cell", "electrochemical", "voltage", "reactivity", "hydrogen fuel cell", "electrode potential"] },

  { id: "chem.acids.acids_bases", parent_id: "chem.acids", level: 2, name: "Acids, Bases & pH",
    keywords: ["acid", "base", "alkali", "pH", "indicator", "litmus", "universal indicator", "strong acid", "weak acid", "neutralisation", "hydrogen ion", "hydroxide ion"] },
  { id: "chem.acids.salts", parent_id: "chem.acids", level: 2, name: "Preparation of Salts",
    keywords: ["salt", "soluble", "insoluble", "precipitation", "crystallisation", "titration", "neutralisation", "solubility rules", "hydrated", "water of crystallisation"] },
  { id: "chem.acids.oxides", parent_id: "chem.acids", level: 2, name: "Oxides",
    keywords: ["acidic oxide", "basic oxide", "amphoteric", "neutral oxide", "metal oxide", "non-metal oxide"] },

  { id: "chem.periodic.group1", parent_id: "chem.periodic", level: 2, name: "Group I & Group II",
    keywords: ["alkali metal", "group I", "sodium", "potassium", "lithium", "reactivity down group", "group II", "calcium"] },
  { id: "chem.periodic.group7", parent_id: "chem.periodic", level: 2, name: "Group VII (Halogens)",
    keywords: ["halogen", "group VII", "chlorine", "bromine", "iodine", "displacement", "diatomic", "colour of halogen"] },
  { id: "chem.periodic.transition_noble", parent_id: "chem.periodic", level: 2, name: "Transition Elements & Noble Gases",
    keywords: ["transition metal", "transition element", "coloured compound", "catalyst", "variable valency", "noble gas", "group VIII", "group 0", "inert"] },

  { id: "chem.metals.reactivity", parent_id: "chem.metals", level: 2, name: "Reactivity Series",
    keywords: ["reactivity series", "displacement reaction", "reaction with water", "reaction with acid", "reaction with oxygen", "order of reactivity"] },
  { id: "chem.metals.extraction", parent_id: "chem.metals", level: 2, name: "Extraction of Metals",
    keywords: ["extraction", "blast furnace", "iron", "aluminium", "electrolysis of ore", "reduction of ore", "carbon reduction", "ore", "haematite", "bauxite"] },
  { id: "chem.metals.alloys", parent_id: "chem.metals", level: 2, name: "Alloys & Corrosion",
    keywords: ["alloy", "steel", "brass", "corrosion", "rusting", "galvanising", "sacrificial protection", "properties of metals"] },

  { id: "chem.environment.air", parent_id: "chem.environment", level: 2, name: "Air & Combustion",
    keywords: ["air", "composition of air", "oxygen", "nitrogen", "carbon dioxide", "combustion", "air pollution", "greenhouse effect", "acid rain", "carbon monoxide", "sulfur dioxide", "catalytic converter"] },
  { id: "chem.environment.water", parent_id: "chem.environment", level: 2, name: "Water",
    keywords: ["water", "test for water", "water treatment", "purification", "distilled water", "hard water", "cobalt chloride", "anhydrous copper sulfate"] },

  { id: "chem.organic.fuels_alkanes", parent_id: "chem.organic", level: 2, name: "Petroleum & Alkanes",
    keywords: ["petroleum", "crude oil", "fractional distillation", "fraction", "alkane", "saturated", "methane", "combustion of fuel", "homologous series", "cracking"] },
  { id: "chem.organic.alkenes", parent_id: "chem.organic", level: 2, name: "Alkenes",
    keywords: ["alkene", "unsaturated", "ethene", "double bond", "addition reaction", "bromine water", "hydrogenation", "test for unsaturation"] },
  { id: "chem.organic.alcohols_acids", parent_id: "chem.organic", level: 2, name: "Alcohols & Carboxylic Acids",
    keywords: ["alcohol", "ethanol", "fermentation", "carboxylic acid", "ethanoic acid", "ester", "esterification", "oxidation of alcohol", "hydroxyl"] },
  { id: "chem.organic.polymers", parent_id: "chem.organic", level: 2, name: "Macromolecules & Polymers",
    keywords: ["polymer", "polymerisation", "monomer", "poly(ethene)", "addition polymer", "plastic", "macromolecule", "condensation polymer", "nylon"] },
];
