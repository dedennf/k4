// js/map.js
// Logika peta utama EcoTrack

// Inisialisasi peta
const map = L.map("map").setView([-6.9, 107.6], 12);

// Basemap
const basemapOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const basemapEsri = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  }
);

const basemapCarto = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "&copy; CARTO"
  }
);

// Simpan referensi basemap aktif
const baseLayers = {
  osm: basemapOSM,
  esri: basemapEsri,
  carto: basemapCarto
};
let currentBase = basemapOSM;

// Cluster dengan simbologi berbeda untuk legal & ilegal
const clusterLegal = L.markerClusterGroup({
  iconCreateFunction: function (cluster) {
    return L.divIcon({
      html: `<div class="cluster cluster-legal">${cluster.getChildCount()}</div>`,
      className: "cluster-wrapper",
      iconSize: [40, 40]
    });
  }
});

const clusterIlegal = L.markerClusterGroup({
  iconCreateFunction: function (cluster) {
    return L.divIcon({
      html: `<div class="cluster cluster-ilegal">${cluster.getChildCount()}</div>`,
      className: "cluster-wrapper",
      iconSize: [40, 40]
    });
  }
});

// =======================
// LAYER POLYGON KECAMATAN
// =======================
let layerKecamatan = null;

// Data & variabel global
let dataLegal = [];
let dataIlegal = [];
let lastClickedLatLng = null;
let routing = null;

// Elemen DOM
const kecSelect        = document.getElementById("filter-kecamatan");
const statsLegalDiv    = document.getElementById("stats-legal");
const statsIlegalDiv   = document.getElementById("stats-ilegal");
const layerLegalChk    = document.getElementById("layer-legal");
const layerIlegalChk   = document.getElementById("layer-ilegal");
const layerKecamatanChk = document.getElementById("layer-kecamatan"); // <-- checkbox batas kecamatan
const btnLacak         = document.getElementById("btn-lacak");
const btnHapusRute     = document.getElementById("btn-hapus-rute");

function popupHTML(p, isIlegal = false) {
  let fotoHTML = "";

  if (isIlegal && p.Nama_Titik) {
    const imgPath = `img/desk/${p.Nama_Titik}_FOTO.jpg`;

    fotoHTML = `
      <div class="popup-photo-wrap">
        <img
          src="${imgPath}"
          alt="Foto ${p.Nama_Titik}"
          class="popup-photo popup-photo-click"
          data-src="${imgPath}"
        >
      </div>
    `;
  }

  return `
    <h4 style="margin-bottom:4px">${p.Nama_Titik || "-"}</h4>
    <p style="margin:0"><b>Kecamatan:</b> ${p.Kecamatan || "-"}</p>
    ${fotoHTML}
    <a href="detail.html?id=${encodeURIComponent(p.Nama_Titik || "")}" class="popup-detail-link">
      Lihat Detail
    </a>
  `;
}




// ---------------------------
// LOAD DATA
// ---------------------------

Promise.all([
  fetch("data/titik_sampah_legal.geojson").then(r => r.json()),
  fetch("data/titik_sampah_ilegal.geojson").then(r => r.json())
])
  .then(([legal, ilegal]) => {
    dataLegal  = legal.features || [];
    dataIlegal = ilegal.features || [];

    renderLegal();
    renderIlegal();
    updateKecamatan();
    updateStats();

    // kalau checkbox kecamatan dicentang dari awal, langsung load
    if (layerKecamatanChk && layerKecamatanChk.checked) {
      loadKecamatan();
    }
  })
  .catch(err => {
    console.error("Gagal memuat data GeoJSON:", err);
    alert("Gagal memuat data titik sampah. Periksa kembali folder data/.");
  });

// ---------------------------
// RENDER LEGAL / ILEGAL
// ---------------------------

function renderLegal() {
  clusterLegal.clearLayers();

  if (!layerLegalChk.checked) {
    if (map.hasLayer(clusterLegal)) map.removeLayer(clusterLegal);
    return;
  }

  const filter = kecSelect.value;

  dataLegal.forEach(f => {
    const props = f.properties || {};
    if (filter && props.Kecamatan !== filter) return;

    const coords = f.geometry && f.geometry.coordinates;
    if (!coords || coords.length < 2) return;

    const lat = coords[1];
    const lng = coords[0];

    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: "#16a34a", // hijau = legal
      color: "#065f46",
      weight: 2,
      fillOpacity: 0.95
    });

marker.bindPopup(popupHTML(props));


    marker.on("click", e => {
      lastClickedLatLng = e.latlng;
    });

    clusterLegal.addLayer(marker);
  });

  if (!map.hasLayer(clusterLegal)) {
    map.addLayer(clusterLegal);
  }
}

function renderIlegal() {
  clusterIlegal.clearLayers();

  if (!layerIlegalChk.checked) {
    if (map.hasLayer(clusterIlegal)) map.removeLayer(clusterIlegal);
    return;
  }

  const filter = kecSelect.value;

  dataIlegal.forEach(f => {
    const props = f.properties || {};
    if (filter && props.Kecamatan !== filter) return;

    const coords = f.geometry && f.geometry.coordinates;
    if (!coords || coords.length < 2) return;

    const lat = coords[1];
    const lng = coords[0];

    const marker = L.circleMarker([lat, lng], {
      radius: 9,             // sedikit lebih besar = ilegal
      fillColor: "#dc2626",  // merah = ilegal
      color: "#7f1d1d",
      weight: 2,
      fillOpacity: 0.95
    });


    marker.bindPopup(popupHTML(props, true));
    marker.on("click", e => {
      lastClickedLatLng = e.latlng;
    });

    clusterIlegal.addLayer(marker);
  });

  if (!map.hasLayer(clusterIlegal)) {
    map.addLayer(clusterIlegal);
  }
}

// ---------------------------
// KECAMATAN & STATISTIK
// ---------------------------

function updateKecamatan() {
  const all = [...dataLegal, ...dataIlegal];
  const set = new Set();

  all.forEach(f => {
    const p = f.properties || {};
    if (p.Kecamatan) set.add(p.Kecamatan);
  });

  const list = Array.from(set).sort();

  kecSelect.innerHTML = `<option value="">Semua Kecamatan</option>`;
  list.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    kecSelect.appendChild(opt);
  });
}

function hitungPerKecamatan(features) {
  const out = {};
  features.forEach(f => {
    const p = f.properties || {};
    const kec = p.Kecamatan || "Tidak Diketahui";
    out[kec] = (out[kec] || 0) + 1;
  });
  return out;
}

function updateStats() {
  const filter = kecSelect.value;

  const filteredLegal = dataLegal.filter(f => {
    const p = f.properties || {};
    return !filter || p.Kecamatan === filter;
  });

  const filteredIlegal = dataIlegal.filter(f => {
    const p = f.properties || {};
    return !filter || p.Kecamatan === filter;
  });

  const statsLegal  = hitungPerKecamatan(filteredLegal);
  const statsIlegal = hitungPerKecamatan(filteredIlegal);

  statsLegalDiv.innerHTML = "";
  statsIlegalDiv.innerHTML = "";

  Object.keys(statsLegal).sort().forEach(k => {
    const div = document.createElement("div");
    div.className = "stats-row";
    div.innerHTML = `<span>${k}</span><span>${statsLegal[k]} titik</span>`;
    statsLegalDiv.appendChild(div);
  });

  Object.keys(statsIlegal).sort().forEach(k => {
    const div = document.createElement("div");
    div.className = "stats-row";
    div.innerHTML = `<span>${k}</span><span>${statsIlegal[k]} titik</span>`;
    statsIlegalDiv.appendChild(div);
  });
}

// ---------------------------
// LAYER POLYGON KECAMATAN
// (transparan + hover highlight)
// ---------------------------

function kecamatanStyle(feature) {
  return {
    color: "#1e3a8a",
    weight: 1.5,
    fillColor: "#3b82f6",
    fillOpacity: 0.20,
    interactive: false   // ← solusi utama
  };
}

function loadKecamatan() {
  if (!layerKecamatanChk) return;

  // Kalau checkbox mati → hapus layer dari peta
  if (!layerKecamatanChk.checked) {
    if (layerKecamatan && map.hasLayer(layerKecamatan)) {
      map.removeLayer(layerKecamatan);
    }
    return;
  }

  // Jika belum pernah dibuat, fetch dulu GeoJSON-nya
  if (!layerKecamatan) {
    fetch("data/kecamatan_bandung.geojson")
      .then(r => r.json())
      .then(geo => {
        layerKecamatan = L.geoJSON(geo, {
          style: kecamatanStyle,
          onEachFeature: function (feature, layer) {
            const props = feature.properties || {};
            const namaKec =
              props.Kecamatan ||
              props.KECAMATAN ||
              props.NAMOBJ ||
              props.WADMKC ||
              "-";

            layer.bindPopup(`<b>Kecamatan:</b> ${namaKec}`);

            layer.on({
              mouseover: function (e) {
                const l = e.target;
                l.setStyle({
                  weight: 3,
                  fillOpacity: 0.40
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                  l.bringToFront();
                }
              },
              mouseout: function (e) {
                // kembalikan ke style default
                layerKecamatan.resetStyle(e.target);
              },
              click: function (e) {
                e.target.openPopup();
              }
            });
          }
        }).addTo(map);
      })
      .catch(err => {
        console.error("Gagal memuat polygon kecamatan:", err);
        alert("Gagal memuat layer kecamatan. Periksa file kecamatan_bandung.geojson.");
      });
  } else {
    // Kalau layer sudah ada, cukup tampilkan lagi
    layerKecamatan.addTo(map);
  }
}

// ---------------------------
// EVENT: FILTER & LAYER
// ---------------------------

layerLegalChk.addEventListener("change", () => {
  renderLegal();
  updateStats();
});

layerIlegalChk.addEventListener("change", () => {
  renderIlegal();
  updateStats();
});

if (layerKecamatanChk) {
  layerKecamatanChk.addEventListener("change", () => {
    loadKecamatan();
  });
}

kecSelect.addEventListener("change", () => {
  renderLegal();
  renderIlegal();
  updateStats();
});

// ---------------------------
// GANTI BASEMAP
// ---------------------------

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const val = radio.value;
    const nextBase = baseLayers[val];
    if (!nextBase) return;

    if (currentBase && map.hasLayer(currentBase)) {
      map.removeLayer(currentBase);
    }

    currentBase = nextBase;
    currentBase.addTo(map);
  });
});

// ---------------------------
// ROUTING: LACAK LOKASI KE TITIK
// ---------------------------

btnLacak.addEventListener("click", () => {
  if (!lastClickedLatLng) {
    alert("Silakan klik salah satu titik dulu di peta.");
    return;
  }

  if (!navigator.geolocation) {
    alert("Browser Anda tidak mendukung geolocation.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const userLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);

      if (routing) {
        map.removeControl(routing);
        routing = null;
      }

      routing = L.Routing.control({
        waypoints: [userLatLng, lastClickedLatLng],
        routeWhileDragging: false,
        lineOptions: {
          styles: [
            { color: "#2563eb", weight: 5, opacity: 0.9 }
          ]
        },
        createMarker: function (i, wp) {
          return L.marker(wp.latLng);
        }
      }).addTo(map);
    },
    err => {
      console.error("Gagal mendapatkan lokasi:", err);
      alert("Tidak dapat mengambil lokasi Anda. Pastikan izin lokasi diaktifkan.");
    }
  );
});

btnHapusRute.addEventListener("click", () => {
  if (routing) {
    map.removeControl(routing);
    routing = null;
  }
});

// ---------------------------
// SEDIKIT STYLING UNTUK LINK DI POPUP (opsional)
// ---------------------------

/* nothing in JS; styling ada di CSS */
// ===========================
// ===========================
// ===========================
// ZOOM FOTO DARI POPUP LEAFLET
// ===========================
window.addEventListener("load", function () {
  const zoomModalMap = document.getElementById("zoomModalMap");
  const zoomImgMap   = document.getElementById("zoomImgMap");
  const zoomCloseMap = document.querySelector(".zoom-close-map");

  if (!zoomModalMap || !zoomImgMap || !zoomCloseMap) {
    console.warn("Zoom modal untuk peta tidak ditemukan di DOM (setelah load).");
    return;
  }

  // klik global di dokumen → kalau yang diklik img .popup-photo-click, buka modal
  document.addEventListener("click", function (e) {
    const target = e.target;
    if (
      target &&
      target.classList &&
      target.classList.contains("popup-photo-click")
    ) {
      const src = target.getAttribute("data-src") || target.getAttribute("src");
      if (!src) return;

      zoomImgMap.src = src;
      zoomModalMap.style.display = "block";
    }
  });

  // tombol X menutup modal
  zoomCloseMap.addEventListener("click", function () {
    zoomModalMap.style.display = "none";
    zoomImgMap.src = "";
  });

  // klik area gelap di luar gambar
  zoomModalMap.addEventListener("click", function (e) {
    if (e.target === zoomModalMap) {
      zoomModalMap.style.display = "none";
      zoomImgMap.src = "";
    }
  });
});
