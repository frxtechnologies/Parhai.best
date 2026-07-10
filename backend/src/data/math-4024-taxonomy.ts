/**
 * Cambridge O Level Mathematics (Syllabus D) 4024 — stable topic taxonomy.
 * IDs are PERMANENT once questions reference them. Never remove or rename.
 */

import type { TaxonomyTopic } from "./taxonomy-types";

export const MATH_4024_TAXONOMY: TaxonomyTopic[] = [
  // ── Level 1 sections ──────────────────────────────────────────────────────
  { id: "math.number", parent_id: null, level: 1, name: "Number", keywords: ["number", "integer", "fraction", "decimal", "percentage", "ratio", "standard form"] },
  { id: "math.algebra", parent_id: null, level: 1, name: "Algebra", keywords: ["algebra", "equation", "expression", "quadratic", "inequality", "sequence", "function"] },
  { id: "math.geometry", parent_id: null, level: 1, name: "Geometry", keywords: ["geometry", "angle", "triangle", "circle", "polygon", "construction", "symmetry"] },
  { id: "math.mensuration", parent_id: null, level: 1, name: "Mensuration", keywords: ["area", "perimeter", "volume", "surface area", "arc", "sector"] },
  { id: "math.trigonometry", parent_id: null, level: 1, name: "Trigonometry", keywords: ["trigonometry", "sine", "cosine", "tangent", "pythagoras", "bearing"] },
  { id: "math.coordinate", parent_id: null, level: 1, name: "Coordinate Geometry & Graphs", keywords: ["coordinate", "gradient", "graph", "line", "curve", "intercept"] },
  { id: "math.vmt", parent_id: null, level: 1, name: "Vectors, Matrices & Transformations", keywords: ["vector", "matrix", "transformation", "reflection", "rotation", "enlargement"] },
  { id: "math.statistics", parent_id: null, level: 1, name: "Statistics & Probability", keywords: ["statistics", "probability", "average", "mean", "histogram", "cumulative frequency"] },
  { id: "math.sets", parent_id: null, level: 1, name: "Sets", keywords: ["set", "venn diagram", "union", "intersection", "element", "subset"] },

  // ── Level 2 subtopics ─────────────────────────────────────────────────────
  { id: "math.number.types", parent_id: "math.number", level: 2, name: "Types of Number",
    keywords: ["integer", "prime", "factor", "multiple", "HCF", "LCM", "square number", "cube number", "rational", "irrational", "natural number", "prime factorisation"] },
  { id: "math.number.fractions", parent_id: "math.number", level: 2, name: "Fractions, Decimals & Percentages",
    keywords: ["fraction", "decimal", "percentage", "percentage change", "recurring decimal", "convert", "of a quantity"] },
  { id: "math.number.ratio", parent_id: "math.number", level: 2, name: "Ratio, Proportion & Rate",
    keywords: ["ratio", "proportion", "direct proportion", "inverse proportion", "rate", "share", "map scale", "speed", "density"] },
  { id: "math.number.indices_standard_form", parent_id: "math.number", level: 2, name: "Indices & Standard Form",
    keywords: ["indices", "index", "power", "standard form", "scientific notation", "laws of indices", "reciprocal", "root"] },
  { id: "math.number.approximation", parent_id: "math.number", level: 2, name: "Approximation & Limits of Accuracy",
    keywords: ["approximation", "estimate", "significant figures", "decimal places", "rounding", "upper bound", "lower bound", "limits of accuracy"] },
  { id: "math.number.finance", parent_id: "math.number", level: 2, name: "Everyday Mathematics (Money & Finance)",
    keywords: ["money", "profit", "loss", "discount", "simple interest", "compound interest", "currency", "exchange rate", "tax", "cost price", "selling price"] },

  { id: "math.algebra.expressions", parent_id: "math.algebra", level: 2, name: "Algebraic Manipulation",
    keywords: ["expand", "factorise", "factorize", "simplify", "algebraic fraction", "substitution", "brackets", "common factor", "difference of two squares"] },
  { id: "math.algebra.equations", parent_id: "math.algebra", level: 2, name: "Linear & Simultaneous Equations",
    keywords: ["linear equation", "solve equation", "simultaneous equations", "elimination", "substitution method", "rearrange", "change the subject", "formula"] },
  { id: "math.algebra.quadratics", parent_id: "math.algebra", level: 2, name: "Quadratic Equations",
    keywords: ["quadratic", "quadratic formula", "completing the square", "factorising quadratic", "roots", "parabola", "x squared"] },
  { id: "math.algebra.inequalities", parent_id: "math.algebra", level: 2, name: "Inequalities",
    keywords: ["inequality", "greater than", "less than", "number line", "region", "linear programming", "solution set"] },
  { id: "math.algebra.sequences", parent_id: "math.algebra", level: 2, name: "Sequences",
    keywords: ["sequence", "nth term", "term to term", "pattern", "linear sequence", "arithmetic", "next term"] },
  { id: "math.algebra.functions", parent_id: "math.algebra", level: 2, name: "Functions & Variation",
    keywords: ["function", "f(x)", "composite function", "inverse function", "variation", "directly proportional", "inversely proportional", "mapping"] },

  { id: "math.geometry.angles", parent_id: "math.geometry", level: 2, name: "Angles & Polygons",
    keywords: ["angle", "parallel lines", "alternate angles", "corresponding angles", "interior angle", "exterior angle", "polygon", "quadrilateral", "triangle angles"] },
  { id: "math.geometry.congruence_similarity", parent_id: "math.geometry", level: 2, name: "Congruence & Similarity",
    keywords: ["congruent", "similar", "similarity", "scale factor", "corresponding sides", "enlargement ratio", "area factor", "volume factor"] },
  { id: "math.geometry.circles", parent_id: "math.geometry", level: 2, name: "Circle Theorems & Symmetry",
    keywords: ["circle theorem", "tangent", "chord", "cyclic quadrilateral", "angle at centre", "angle at circumference", "alternate segment", "symmetry"] },
  { id: "math.geometry.constructions", parent_id: "math.geometry", level: 2, name: "Constructions, Loci & Scale Drawings",
    keywords: ["construction", "bisector", "perpendicular bisector", "locus", "loci", "scale drawing", "compass", "ruler", "net"] },

  { id: "math.mensuration.area_perimeter", parent_id: "math.mensuration", level: 2, name: "Perimeter & Area",
    keywords: ["perimeter", "area", "rectangle", "triangle area", "parallelogram", "trapezium", "compound shape", "circle area", "circumference"] },
  { id: "math.mensuration.volume_surface", parent_id: "math.mensuration", level: 2, name: "Volume & Surface Area",
    keywords: ["volume", "surface area", "prism", "cylinder", "cone", "sphere", "pyramid", "cuboid", "cross-section"] },
  { id: "math.mensuration.arc_sector", parent_id: "math.mensuration", level: 2, name: "Arc Length & Sector Area",
    keywords: ["arc length", "sector", "sector area", "radian", "segment", "perimeter of sector"] },

  { id: "math.trig.right_angled", parent_id: "math.trigonometry", level: 2, name: "Pythagoras & Right-Angled Trigonometry",
    keywords: ["pythagoras", "hypotenuse", "right-angled triangle", "sine", "cosine", "tangent", "SOHCAHTOA", "opposite", "adjacent"] },
  { id: "math.trig.non_right", parent_id: "math.trigonometry", level: 2, name: "Sine & Cosine Rule",
    keywords: ["sine rule", "cosine rule", "area of triangle", "half ab sin C", "non-right-angled", "ambiguous case"] },
  { id: "math.trig.applications", parent_id: "math.trigonometry", level: 2, name: "Bearings, Elevation & 3D",
    keywords: ["bearing", "angle of elevation", "angle of depression", "three-dimensional", "3D trigonometry", "north"] },

  { id: "math.coordinate.lines", parent_id: "math.coordinate", level: 2, name: "Straight Line Graphs",
    keywords: ["gradient", "y-intercept", "equation of a line", "y=mx+c", "midpoint", "length of line", "parallel gradient", "perpendicular gradient"] },
  { id: "math.coordinate.graphs", parent_id: "math.coordinate", level: 2, name: "Graphs of Functions",
    keywords: ["graph", "curve", "quadratic graph", "cubic graph", "reciprocal graph", "plot", "gradient of curve", "estimate", "distance-time graph", "speed-time graph"] },

  { id: "math.vmt.vectors", parent_id: "math.vmt", level: 2, name: "Vectors",
    keywords: ["vector", "column vector", "magnitude", "position vector", "resultant", "parallel vectors", "translation vector"] },
  { id: "math.vmt.matrices", parent_id: "math.vmt", level: 2, name: "Matrices",
    keywords: ["matrix", "matrices", "determinant", "inverse matrix", "matrix multiplication", "identity matrix", "order of matrix"] },
  { id: "math.vmt.transformations", parent_id: "math.vmt", level: 2, name: "Transformations",
    keywords: ["transformation", "reflection", "rotation", "translation", "enlargement", "centre of enlargement", "scale factor", "invariant", "image"] },

  { id: "math.stats.representation", parent_id: "math.statistics", level: 2, name: "Data Representation",
    keywords: ["bar chart", "pie chart", "histogram", "frequency table", "cumulative frequency", "pictogram", "stem and leaf", "scatter diagram", "frequency polygon"] },
  { id: "math.stats.averages", parent_id: "math.statistics", level: 2, name: "Averages & Spread",
    keywords: ["mean", "median", "mode", "range", "quartile", "interquartile range", "modal class", "estimated mean", "percentile"] },
  { id: "math.probability.probability", parent_id: "math.statistics", level: 2, name: "Probability",
    keywords: ["probability", "outcome", "event", "tree diagram", "combined events", "mutually exclusive", "independent", "expected frequency", "sample space"] },

  { id: "math.sets.sets", parent_id: "math.sets", level: 2, name: "Sets & Venn Diagrams",
    keywords: ["set", "venn diagram", "union", "intersection", "complement", "subset", "element", "universal set", "empty set", "notation"] },
];
