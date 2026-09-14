// Real 23-family / 133-style catalogue, extracted from
// ../realpotential-style-index.html (one level up). Keep in sync with that
// file if the catalogue ever changes.

export type StyleFamily = {
  family: string;
  styles: string[];
};

// Turns a style name into its example-image filename slug, e.g.
// "Company / Mill House" -> "company-mill-house". Drop a real example
// render at /public/images/styles/<slug>.jpg once it exists — the upload
// page falls back to a placeholder automatically until then, no code
// changes needed.
export function slugifyStyleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const STYLE_FAMILIES: StyleFamily[] = [
  { family: "American Colonial & Early", styles: ["Saltbox", "Cape Cod", "Colonial Georgian", "Federal", "Dutch Colonial", "Garrison Colonial", "Spanish Colonial", "French Colonial", "Pueblo Adobe"] },
  { family: "American Victorian Era", styles: ["Queen Anne", "Second Empire", "Italianate", "Gothic Revival", "Stick Style", "Shingle Style", "Folk Victorian", "Richardsonian Romanesque"] },
  { family: "American Vernacular & Regional", styles: ["American Foursquare", "Ranch", "Split-Level", "Raised Ranch", "Minimal Traditional", "Company / Mill House", "Shotgun House", "I-House", "Bank Barn Conversion"] },
  { family: "Arts & Crafts", styles: ["Craftsman Bungalow", "Prairie School", "Tudor Revival", "Mission Revival", "Storybook / Cotswold"] },
  { family: "Modern & Contemporary", styles: ["International Style", "Bauhaus", "Contemporary Minimalist", "Industrial Modern", "Barndominium", "Shed Style", "Brutalist", "Passive House Modern", "Deconstructivist", "Glass Pavilion"] },
  { family: "Mid-Century & Atomic", styles: ["Mid-Century Modern", "Eichler", "Atomic Ranch / Googie", "Desert Modern", "Usonian"] },
  { family: "European Classical", styles: ["Greek Revival", "Roman Villa", "Palladian", "Neoclassical", "Beaux-Arts"] },
  { family: "British Isles", styles: ["Tudor Half-Timbered", "English Cottage / Thatch", "Cotswold Stone", "Georgian Terrace", "Scottish Baronial", "Welsh Longhouse"] },
  { family: "French", styles: ["French Provincial", "Normandy", "Mansard Parisian", "Château"] },
  { family: "Germanic & Alpine", styles: ["Swiss Chalet", "Bavarian Alpine", "Tyrolean", "Black Forest Farmhouse", "Fachwerk Half-Timber", "Austrian Mountain Lodge"] },
  { family: "Nordic & Scandinavian", styles: ["Scandinavian Modern", "Swedish Falu Cottage", "Danish Modern", "Norwegian Stave-Inspired", "Icelandic Turf Roof", "Nordic Green Roof"] },
  { family: "Mediterranean & Iberian", styles: ["Mediterranean Villa", "Tuscan", "Spanish Mission", "Andalusian Courtyard", "Portuguese Azulejo", "Cycladic Greek"] },
  { family: "Slavic & Eastern European", styles: ["Russian Dacha", "Zakopane Highlander", "Ukrainian Khata", "Romanian Wooden"] },
  { family: "East Asian", styles: ["Pagoda-Roof Manor", "Japanese Minka", "Japanese Machiya", "Sukiya Teahouse", "Korean Hanok", "Chinese Siheyuan", "Zen Modern Fusion"] },
  { family: "South & Southeast Asian", styles: ["Balinese Villa", "Thai Stilt House", "Kerala Nalukettu", "Bahay Kubo"] },
  { family: "Middle Eastern & North African", styles: ["Moroccan Riad", "Persian Courtyard", "Mashrabiya Modern", "Mudbrick Kasbah"] },
  { family: "Latin American & Caribbean", styles: ["Mexican Hacienda", "Caribbean Creole", "Cuban Colonial", "Brazilian Modernist"] },
  { family: "African", styles: ["Cape Dutch", "Swahili Coastal Stone", "Rondavel-Inspired"] },
  { family: "Rustic, Lodge & Frontier", styles: ["Log Cabin", "Old West Frontier", "Appalachian Farmhouse", "A-Frame", "Timber Frame", "Mountain Modern", "Adirondack Great Camp"] },
  { family: "Coastal", styles: ["Nantucket Shingle", "Coastal Cottage", "Key West Conch", "Stilt Beach House", "Lowcountry Southern"] },
  { family: "Desert & Southwestern", styles: ["Pueblo Revival", "Territorial", "Desert Contemporary"] },
  { family: "Eco & Alternative", styles: ["Tiny House", "Shipping Container", "Cob & Earthen", "Geodesic Dome", "Earthship", "Green Roof Modern", "Solar Passive Modern"] },
  { family: "Fantasy & Statement", styles: ["Gothic Castle", "Victorian Gothic Manor", "Southern Plantation", "Steampunk Industrial", "Fairytale Cottage", "Hobbit Earth House"] },
];
