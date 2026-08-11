import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocationPicker } from "@/components/LocationPicker";

// El componente es controlado, así que el harness hace de formulario. Se pintan
// los valores en un <output> para poder comprobarlos desde la prueba sin
// hurgar en el estado de React.
function Formulario() {
  const [department, setDepartment] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div style={{ width: 640, padding: 16 }}>
      <LocationPicker
        department={department}
        onDepartmentChange={setDepartment}
        location={location}
        onLocationChange={setLocation}
        lat={coords?.lat ?? null}
        lng={coords?.lng ?? null}
        onCoordsChange={(la, ln) => setCoords(la != null && ln != null ? { lat: la, lng: ln } : null)}
        required
      />
      <output id="valores">
        {`${department ?? "—"}|${location || "—"}|${coords ? "con punto" : "sin punto"}`}
      </output>
      <output id="punto">
        {coords ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : "—"}
      </output>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Formulario />);
