/* ============================================================
   DETAIL.JS FINAL
   ============================================================ */

// GLOBAL VARIABEL
let allData = [];
let selectedFeature = null;

// MAP GLOBAL AGAR TIDAK DIBUAT BERULANG
let mapDetail = null;
let markerDetail = null;

// ELEMENT HTML
const selectTitik = document.getElementById("pilih-titik");
const judulDiv = document.getElementById("judul-titik");
const deskDiv = document.getElementById("deskripsi");
const galeriDiv = document.getElementById("galeri");
const metaTable = document.getElementById("meta-table");

// Tombol unduh titik (di tab "Unduh")
const downloadPointBtn = document.getElementById("download-point");


// Ambil ID dari URL
const params = new URLSearchParams(window.location.search);
let currentID = params.get("id");


// ============================================================
// LOAD DATA GEOJSON (LEGAL & ILEGAL)
// ============================================================

Promise.all([
    fetch("data/titik_sampah_legal.geojson").then(r => r.json()),
    fetch("data/titik_sampah_ilegal.geojson").then(r => r.json())
])
.then(([legal, ilegal]) => {

    // Gabungkan & beri kategori
    allData = [
        ...ilegal.features.map(f => ({ ...f, kategori: "Ilegal" })),
        ...legal.features.map(f => ({ ...f, kategori: "Legal" }))
        
    ];

    isiDropdown();

    if (currentID) pilihTitik(currentID);
    else pilihTitik(allData[0].properties.Nama_Titik);
});


// ============================================================
// DROPDOWN TITIK
// ============================================================

function isiDropdown() {
    selectTitik.innerHTML = "";

    allData.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f.properties.Nama_Titik;
        opt.textContent = `${f.properties.Nama_Titik} (${f.kategori})`;
        selectTitik.appendChild(opt);
    });

    if (currentID) selectTitik.value = currentID;

    selectTitik.onchange = () => pilihTitik(selectTitik.value);
}


// ============================================================
// PILIH TITIK
// ============================================================

function pilihTitik(nama) {
    currentID = nama;

    selectedFeature = allData.find(
        f => f.properties.Nama_Titik === nama
    );

    isiHeader();
    isiDeskripsi();
    isiFoto();
    isiMetadata();
    isiDownload();
    tampilkanMap();
}


// ============================================================
// HEADER TITIK
// ============================================================

function isiHeader() {
    judulDiv.textContent = selectedFeature.properties.Nama_Titik;
}


// ============================================================
// DESKRIPSI
// ============================================================

function isiDeskripsi() {
    const p = selectedFeature.properties;

    deskDiv.innerHTML = `
        <b>Nama Titik:</b> ${p.Nama_Titik}<br>
        <b>Kecamatan:</b> ${p.Kecamatan}<br>
        <b>Keterangan:</b> ${p.Keterangan || "-"}<br>
        <b>Kategori:</b> ${selectedFeature.kategori}
    `;
}


// ============================================================
// FOTO (img/Nama_Titik.jpg)
// ============================================================

function isiFoto() {
    const nama = selectedFeature.properties.Nama_Titik;
    const img = `img/${nama}.jpg`;

    galeriDiv.innerHTML = `
        <img src="${img}" 
             onerror="this.src='img/no-image.jpg'" 
             style="width:100%; border-radius:12px;">
    `;
}


// ============================================================
// METADATA (Semua atribut dari GeoJSON)
// ============================================================

function isiMetadata() {
    const p = selectedFeature.properties;

    metaTable.innerHTML = "";

    for (let key in p) {
        metaTable.innerHTML += `
            <tr>
                <td><b>${key}</b></td>
                <td>${p[key]}</td>
            </tr>
        `;
    }

    // Tambahkan kategori
    metaTable.innerHTML += `
        <tr>
            <td><b>Kategori</b></td>
            <td>${selectedFeature.kategori}</td>
        </tr>
    `;
}


// ============================================================
// UNDUH DATA TITIK YANG SEDANG DIPILIH (FORMAT GEOJSON)
// ============================================================

function isiDownload() {
    // Jika elemen tombol tidak ada atau belum ada titik terpilih, keluar saja
    if (!downloadPointBtn || !selectedFeature) return;

    // Set ulang handler setiap kali titik berganti
    downloadPointBtn.onclick = () => {
        // Nama file pakai Nama_Titik, fallback kalau kosong
        const nama = (selectedFeature.properties && selectedFeature.properties.Nama_Titik)
            ? selectedFeature.properties.Nama_Titik
            : "titik";

        // Susun objek Feature untuk diunduh
        const featureForDownload = {
            type: "Feature",
            geometry: selectedFeature.geometry,
            properties: selectedFeature.properties,
            kategori: selectedFeature.kategori
        };

        // Buat Blob dari data GeoJSON
        const blob = new Blob(
            [JSON.stringify(featureForDownload, null, 2)],
            { type: "application/geo+json" }
        );

        // Buat URL sementara untuk diunduh
        const url = URL.createObjectURL(blob);

        // Buat <a> sementara lalu trigger klik
        const a = document.createElement("a");
        a.href = url;
        a.download = `${nama}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Bersihkan URL blob
        URL.revokeObjectURL(url);
    };
}



// ============================================================
// PETA (MENGIKUTI TITIK TERPILIH) — FIXED!!!
// ============================================================

function tampilkanMap() {
    const c = selectedFeature.geometry.coordinates;
    const lat = c[1];
    const lng = c[0];

    // Jika map belum ada → buat 1x saja
    if (!mapDetail) {

        mapDetail = L.map("map-detail").setView([lat, lng], 17);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19
        }).addTo(mapDetail);

        markerDetail = L.marker([lat, lng]).addTo(mapDetail);

    } else {
        // Jika map sudah ada → pindahkan view
        mapDetail.setView([lat, lng], 17, { animate: true });

        // Pindahkan marker
        markerDetail.setLatLng([lat, lng])
            .bindPopup(selectedFeature.properties.Nama_Titik)
            .openPopup();
    }
}


// ============================================================
// TAB SYSTEM
// ============================================================

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const tab = btn.dataset.tab;

        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById("tab-" + tab).classList.add("active");
    };
});
// ======================
// ZOOM FOTO (EVENT DELEGATION)
// ======================

const zoomModal = document.getElementById("zoomModal");
const zoomImg   = document.getElementById("zoomImg");
const zoomClose = document.querySelector("#zoomModal .zoom-close");
const galeri    = document.getElementById("galeri");

// kalau kontainer galeri ada
if (galeri && zoomModal && zoomImg && zoomClose) {

  // klik FOTO di dalam #galeri => buka modal
  galeri.addEventListener("click", function (e) {
    const target = e.target;
    if (target && target.tagName && target.tagName.toLowerCase() === "img") {
      zoomImg.src = target.src;
      zoomModal.style.display = "block";
    }
  });

  // klik tombol X => tutup
  zoomClose.addEventListener("click", function () {
    zoomModal.style.display = "none";
  });

  // klik area gelap di luar gambar => tutup
  zoomModal.addEventListener("click", function (e) {
    if (e.target === zoomModal) {
      zoomModal.style.display = "none";
    }
  });
}
