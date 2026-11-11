/**
 * OCR utilities for extracting information from images
 */
export const OCRUtils = {
  /**
   * Extract license plate from text
   */
  extractLicensePlate(text) {
    const patterns = [
      /\b[A-Z]{1,3}[-\s]?\d{1,4}[-\s]?[A-Z]{0,3}\b/g,
      /\b\d{1,3}[-\s]?[A-Z]{2,3}[-\s]?\d{1,4}\b/g,
      /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g  // UK format
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        return matches[0].replace(/[-\s]/g, '').toUpperCase();
      }
    }
    return null;
  },

  /**
   * Extract vehicle information
   */
  extractVehicleInfo(text) {
    const makes = [
      'Honda', 'Toyota', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 
      'Nissan', 'Volkswagen', 'Hyundai', 'Kia', 'Mazda', 'Subaru', 'Tesla',
      'Lexus', 'Jeep', 'Ram', 'GMC', 'Dodge', 'Chrysler', 'Cadillac'
    ];
    
    const colors = [
      'Black', 'White', 'Silver', 'Gray', 'Grey', 'Red', 'Blue', 'Green', 
      'Yellow', 'Orange', 'Brown', 'Purple', 'Gold', 'Beige', 'Tan'
    ];
    
    const models = [
      'Accord', 'Civic', 'Camry', 'Corolla', 'F-150', 'Silverado', 
      'Model 3', 'Model S', 'Model X', 'Mustang', 'Explorer'
    ];
    
    let make = null, color = null, model = null, year = null;
    
    for (const m of makes) {
      if (text.includes(m)) {
        make = m;
        break;
      }
    }
    
    for (const c of colors) {
      if (text.includes(c)) {
        color = c;
        break;
      }
    }
    
    for (const mod of models) {
      if (text.includes(mod)) {
        model = mod;
        break;
      }
    }
    
    // Extract year (1990-2025)
    const yearMatch = text.match(/\b(19[9]\d|20[0-2]\d)\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[0]);
    }
    
    return { make, color, model, year };
  },

  /**
   * Extract person features from analysis
   */
  extractPersonFeatures(text) {
    const genders = ['male', 'female', 'man', 'woman'];
    const ages = text.match(/\b(\d{1,2})\s*(years?\s*old|yo)\b/i);
    
    let gender = null, age = null, description = null;
    
    for (const g of genders) {
      if (text.toLowerCase().includes(g)) {
        gender = g;
        break;
      }
    }
    
    if (ages) {
      age = parseInt(ages[1]);
    }
    
    // Extract clothing description
    const clothingMatch = text.match(/wearing\s+([^.]+)/i);
    if (clothingMatch) {
      description = clothingMatch[1].trim();
    }
    
    return { gender, age, description };
  },

  /**
   * Extract surveillance equipment mentions
   */
  extractSurveillanceEquipment(text) {
    const equipment = [
      'camera', 'cctv', 'surveillance', 'microphone', 'recorder',
      'tracking device', 'gps', 'drone', 'binoculars', 'antenna'
    ];
    
    const found = [];
    for (const eq of equipment) {
      if (text.toLowerCase().includes(eq)) {
        found.push(eq);
      }
    }
    
    return found;
  }
};