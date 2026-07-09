/**
 * Cambridge IGCSE Physics 0625 — stable topic taxonomy.
 * IDs are PERMANENT once questions reference them. Never remove or rename.
 */

export type TaxonomyTopic = {
  id: string;
  parent_id: string | null;
  level: 1 | 2;
  name: string;
  keywords: string[];
};

export const PHYSICS_0625_TAXONOMY: TaxonomyTopic[] = [
  // ── Level 1: topic sections ───────────────────────────────────────────────
  {
    id: "phys.motion", parent_id: null, level: 1,
    name: "Motion, Forces and Energy",
    keywords: ["motion", "forces", "energy", "mechanics", "work", "power", "momentum", "pressure"],
  },
  {
    id: "phys.thermal", parent_id: null, level: 1,
    name: "Thermal Physics",
    keywords: ["thermal", "heat", "temperature", "kinetic", "particle", "conduction", "convection", "radiation", "latent", "specific heat"],
  },
  {
    id: "phys.waves", parent_id: null, level: 1,
    name: "Waves, Light and Sound",
    keywords: ["wave", "light", "sound", "reflection", "refraction", "diffraction", "electromagnetic", "lens", "optics"],
  },
  {
    id: "phys.electricity", parent_id: null, level: 1,
    name: "Electricity and Magnetism",
    keywords: ["electricity", "electric", "circuit", "current", "voltage", "resistance", "magnet", "magnetic", "motor", "generator", "transformer"],
  },
  {
    id: "phys.atomic", parent_id: null, level: 1,
    name: "Atomic Physics",
    keywords: ["atom", "nuclear", "radioactivity", "radiation", "proton", "neutron", "electron", "isotope", "half-life", "decay"],
  },

  // ── Level 2: subtopics ────────────────────────────────────────────────────
  {
    id: "phys.motion.measurement", parent_id: "phys.motion", level: 2,
    name: "Physical Quantities and Measurement",
    keywords: ["measurement", "scalar", "vector", "SI units", "significant figures", "systematic error", "random error", "precision", "accuracy", "micrometer", "vernier", "stopwatch"],
  },
  {
    id: "phys.motion.kinematics", parent_id: "phys.motion", level: 2,
    name: "Motion (Speed, Velocity and Acceleration)",
    keywords: ["speed", "velocity", "acceleration", "distance", "displacement", "time", "deceleration", "uniform acceleration", "distance-time graph", "velocity-time graph", "free fall", "terminal velocity", "equations of motion"],
  },
  {
    id: "phys.motion.mass_weight", parent_id: "phys.motion", level: 2,
    name: "Mass and Weight",
    keywords: ["mass", "weight", "gravitational field strength", "inertia", "newton", "balance", "spring balance", "gravitational force"],
  },
  {
    id: "phys.motion.density", parent_id: "phys.motion", level: 2,
    name: "Density",
    keywords: ["density", "volume", "float", "sink", "Archimedes", "upthrust", "displacement method"],
  },
  {
    id: "phys.motion.forces", parent_id: "phys.motion", level: 2,
    name: "Forces",
    keywords: ["force", "resultant", "Newton's laws", "friction", "normal reaction", "free body diagram", "equilibrium", "turning effect", "moment", "torque", "pivot", "principle of moments", "centre of gravity", "stability"],
  },
  {
    id: "phys.motion.momentum", parent_id: "phys.motion", level: 2,
    name: "Momentum",
    keywords: ["momentum", "conservation of momentum", "impulse", "collision", "explosion", "elastic", "inelastic"],
  },
  {
    id: "phys.motion.energy", parent_id: "phys.motion", level: 2,
    name: "Energy, Work and Power",
    keywords: ["energy", "work done", "power", "kinetic energy", "potential energy", "gravitational potential energy", "conservation of energy", "efficiency", "renewable", "non-renewable", "joule", "watt", "energy transfer", "energy resources"],
  },
  {
    id: "phys.motion.pressure", parent_id: "phys.motion", level: 2,
    name: "Pressure",
    keywords: ["pressure", "pascal", "force per unit area", "hydraulic", "atmospheric pressure", "fluid pressure", "manometer", "barometer", "depth"],
  },

  {
    id: "phys.thermal.kinetic_model", parent_id: "phys.thermal", level: 2,
    name: "Kinetic Particle Model of Matter",
    keywords: ["kinetic theory", "particle model", "solid", "liquid", "gas", "states of matter", "Brownian motion", "diffusion", "evaporation", "boiling", "melting", "gas pressure", "Boyle's law", "pressure law"],
  },
  {
    id: "phys.thermal.properties", parent_id: "phys.thermal", level: 2,
    name: "Thermal Properties and Temperature",
    keywords: ["specific heat capacity", "specific latent heat", "latent heat of fusion", "latent heat of vaporisation", "thermal capacity", "thermometer", "temperature", "Celsius", "Kelvin", "thermocouple", "melting point", "boiling point", "heating curve", "cooling curve"],
  },
  {
    id: "phys.thermal.transfer", parent_id: "phys.thermal", level: 2,
    name: "Transfer of Thermal Energy",
    keywords: ["conduction", "convection", "radiation", "thermal radiation", "infrared", "insulation", "vacuum flask", "conductor", "insulator", "convection current", "black body", "emitter", "absorber"],
  },

  {
    id: "phys.waves.general", parent_id: "phys.waves", level: 2,
    name: "General Wave Properties",
    keywords: ["wave", "transverse", "longitudinal", "amplitude", "wavelength", "frequency", "period", "wave speed", "crest", "trough", "compression", "rarefaction", "diffraction", "interference", "ripple tank"],
  },
  {
    id: "phys.waves.light", parent_id: "phys.waves", level: 2,
    name: "Light",
    keywords: ["light", "reflection", "refraction", "total internal reflection", "critical angle", "Snell's law", "refractive index", "lens", "converging lens", "diverging lens", "focal length", "real image", "virtual image", "ray diagram", "plane mirror", "prism", "optical fibre"],
  },
  {
    id: "phys.waves.em_spectrum", parent_id: "phys.waves", level: 2,
    name: "Electromagnetic Spectrum",
    keywords: ["electromagnetic spectrum", "radio waves", "microwaves", "infrared", "visible light", "ultraviolet", "X-rays", "gamma rays", "speed of light"],
  },
  {
    id: "phys.waves.sound", parent_id: "phys.waves", level: 2,
    name: "Sound",
    keywords: ["sound", "longitudinal wave", "pitch", "loudness", "echo", "speed of sound", "ultrasound", "hearing range", "oscilloscope"],
  },

  {
    id: "phys.electricity.magnetism", parent_id: "phys.electricity", level: 2,
    name: "Simple Phenomena of Magnetism",
    keywords: ["magnet", "magnetic field", "field lines", "north pole", "south pole", "attraction", "repulsion", "magnetisation", "demagnetisation", "electromagnet", "solenoid", "induced magnetism", "hard", "soft iron", "steel"],
  },
  {
    id: "phys.electricity.quantities", parent_id: "phys.electricity", level: 2,
    name: "Electrical Quantities",
    keywords: ["current", "charge", "potential difference", "voltage", "resistance", "Ohm's law", "coulomb", "ampere", "volt", "ohm", "I-V characteristic", "ohmic", "thermistor", "LDR", "diode", "filament lamp"],
  },
  {
    id: "phys.electricity.circuits", parent_id: "phys.electricity", level: 2,
    name: "Electric Circuits",
    keywords: ["circuit", "series", "parallel", "resistor", "ammeter", "voltmeter", "switch", "cell", "battery", "EMF", "internal resistance", "logic gate", "AND", "OR", "NOT", "NAND", "NOR", "truth table", "relay", "transistor", "combined resistance"],
  },
  {
    id: "phys.electricity.safety", parent_id: "phys.electricity", level: 2,
    name: "Electrical Safety",
    keywords: ["fuse", "circuit breaker", "earth wire", "live wire", "neutral wire", "plug", "three-pin plug", "earthing", "double insulation", "mains electricity", "hazard", "overload", "short circuit"],
  },
  {
    id: "phys.electricity.electromagnetic", parent_id: "phys.electricity", level: 2,
    name: "Electromagnetic Effects",
    keywords: ["electromagnetic induction", "Fleming's left-hand rule", "motor effect", "force on current", "generator", "dynamo", "AC", "DC", "alternating current", "direct current", "transformer", "step-up", "step-down", "turn ratio", "Faraday's law", "Lenz's law"],
  },

  {
    id: "phys.atomic.nuclear_atom", parent_id: "phys.atomic", level: 2,
    name: "The Nuclear Atom",
    keywords: ["atom", "nucleus", "proton", "neutron", "electron", "proton number", "nucleon number", "atomic number", "mass number", "isotope", "nuclide notation", "shell", "Rutherford", "structure of atom"],
  },
  {
    id: "phys.atomic.radioactivity", parent_id: "phys.atomic", level: 2,
    name: "Radioactivity",
    keywords: ["radioactivity", "alpha particle", "beta particle", "gamma ray", "ionising radiation", "half-life", "decay", "nuclear equation", "penetrating power", "Geiger-Müller tube", "count rate", "background radiation", "safety precautions", "radioactive dating", "nuclear fission", "nuclear fusion", "chain reaction"],
  },
];
