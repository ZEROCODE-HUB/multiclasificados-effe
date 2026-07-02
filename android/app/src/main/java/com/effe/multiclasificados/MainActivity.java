package com.effe.multiclasificados;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 15+ (API 35+) fuerza edge-to-edge y SDK 36 elimina el opt-out.
        // Para que la barra de estado y la de navegación se respeten en TODOS los
        // dispositivos (incluida gama alta con gestos/notch), aplicamos los insets
        // de las system bars + el recorte de pantalla como padding de la vista raíz:
        // así el WebView queda dentro del área segura y no se dibuja bajo las barras.
        final View content = findViewById(android.R.id.content);
        getWindow().getDecorView().setBackgroundColor(Color.WHITE);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
