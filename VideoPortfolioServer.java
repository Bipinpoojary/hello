import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.Executors;

public class VideoPortfolioServer {
	private static final int SERVER_PORT = 8080;
	private static final File DATA_DIRECTORY = new File(".");
	private static final File VIDEOS_DB_FILE = new File(DATA_DIRECTORY, "videos.db");
	private static final File BOOKINGS_DB_FILE = new File(DATA_DIRECTORY, "bookings.db");
	private static final List<VideoItem> VIDEO_ITEMS = Collections.synchronizedList(new ArrayList<>());
	private static final List<BookingItem> BOOKING_ITEMS = Collections.synchronizedList(new ArrayList<>());

	private static final DateTimeFormatter ISO_FORMATTER = DateTimeFormatter.ISO_INSTANT.withZone(ZoneId.of("UTC"));

	public static void main(String[] args) throws Exception {
		loadDataFromDisk();
		HttpServer server = HttpServer.create(new InetSocketAddress(SERVER_PORT), 0);
		server.createContext("/", new RootHandler());
		server.createContext("/api/videos", new VideosHandler());
		server.createContext("/api/videos/", new VideoByIdHandler());
		server.createContext("/api/bookings", new BookingsHandler());
		server.setExecutor(Executors.newFixedThreadPool(8));
		server.start();
		System.out.println("Video Portfolio Server running at http://localhost:" + SERVER_PORT);
	}

	private static class VideoItem {
		String id;
		String title;
		String videoUrl;
		String thumbnailUrl;
		String createdAt;

		static VideoItem fromRecord(String line) {
			String[] parts = line.split("\t", -1);
			if (parts.length < 5) return null;
			VideoItem v = new VideoItem();
			v.id = parts[0];
			v.title = parts[1];
			v.videoUrl = parts[2];
			v.thumbnailUrl = parts[3];
			v.createdAt = parts[4];
			return v;
		}

		String toRecord() { return String.join("\t", ns(id), ns(title), ns(videoUrl), ns(thumbnailUrl), ns(createdAt)); }
	}

	private static class BookingItem {
		String id;
		String fullName;
		String email;
		String phone;
		String date;
		String time;
		String durationHours;
		String shootType;
		String eventType;
		String location;
		String budget;
		String notes;
		String submittedAt;

		static BookingItem fromRecord(String line) {
			String[] p = line.split("\t", -1);
			if (p.length < 13) return null;
			BookingItem b = new BookingItem();
			b.id = p[0]; b.fullName = p[1]; b.email = p[2]; b.phone = p[3]; b.date = p[4]; b.time = p[5]; b.durationHours = p[6];
			b.shootType = p[7]; b.eventType = p[8]; b.location = p[9]; b.budget = p[10]; b.notes = p[11]; b.submittedAt = p[12];
			return b;
		}

		String toRecord() { return String.join("\t", ns(id), ns(fullName), ns(email), ns(phone), ns(date), ns(time), ns(durationHours), ns(shootType), ns(eventType), ns(location), ns(budget), ns(notes), ns(submittedAt)); }
	}

	private static class RootHandler implements HttpHandler {
		@Override public void handle(HttpExchange exchange) throws IOException {
			if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { sendText(exchange, 405, "Method Not Allowed"); return; }
			sendHtml(exchange, 200, getIndexHtml());
		}
	}

	private static class VideosHandler implements HttpHandler {
		@Override public void handle(HttpExchange exchange) throws IOException {
			String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
			if ("GET".equals(method)) { sendJson(exchange, 200, videosToJson()); return; }
			if ("POST".equals(method)) {
				Map<String,String> form = parseWwwForm(exchange);
				String title = form.getOrDefault("title", "").trim();
				String videoUrl = form.getOrDefault("videoUrl", "").trim();
				String thumbnailUrl = form.getOrDefault("thumbnailUrl", "").trim();
				if (title.isEmpty() || videoUrl.isEmpty()) { sendJson(exchange, 400, "{\"error\":\"title and videoUrl required\"}"); return; }
				VideoItem item = new VideoItem();
				item.id = UUID.randomUUID().toString();
				item.title = title; item.videoUrl = videoUrl; item.thumbnailUrl = thumbnailUrl; item.createdAt = ISO_FORMATTER.format(Instant.now());
				VIDEO_ITEMS.add(0, item);
				saveVideosToDisk();
				sendJson(exchange, 201, videoToJson(item));
				return;
			}
			sendText(exchange, 405, "Method Not Allowed");
		}
	}

	private static class VideoByIdHandler implements HttpHandler {
		@Override public void handle(HttpExchange exchange) throws IOException {
			String path = exchange.getRequestURI().getPath();
			String[] parts = path.split("/", -1);
			if (parts.length < 4 || parts[3].isEmpty()) { sendText(exchange, 400, "Bad Request"); return; }
			String id = parts[3];
			if ("DELETE".equalsIgnoreCase(exchange.getRequestMethod())) {
				boolean removed = VIDEO_ITEMS.removeIf(v -> Objects.equals(v.id, id));
				if (removed) { saveVideosToDisk(); sendJson(exchange, 200, "{\"status\":\"deleted\"}"); }
				else { sendJson(exchange, 404, "{\"error\":\"Not found\"}"); }
				return;
			}
			sendText(exchange, 405, "Method Not Allowed");
		}
	}

	private static class BookingsHandler implements HttpHandler {
		@Override public void handle(HttpExchange exchange) throws IOException {
			if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) { sendText(exchange, 405, "Method Not Allowed"); return; }
			Map<String,String> form = parseWwwForm(exchange);
			BookingItem b = new BookingItem();
			b.id = UUID.randomUUID().toString();
			b.fullName = form.getOrDefault("fullName", "").trim();
			b.email = form.getOrDefault("email", "").trim();
			b.phone = form.getOrDefault("phone", "").trim();
			b.date = form.getOrDefault("date", "").trim();
			b.time = form.getOrDefault("time", "").trim();
			b.durationHours = form.getOrDefault("durationHours", "").trim();
			b.shootType = form.getOrDefault("shootType", "").trim();
			b.eventType = form.getOrDefault("eventType", "").trim();
			b.location = form.getOrDefault("location", "").trim();
			b.budget = form.getOrDefault("budget", "").trim();
			b.notes = form.getOrDefault("notes", "").trim();
			b.submittedAt = ISO_FORMATTER.format(Instant.now());
			if (b.fullName.isEmpty() || b.email.isEmpty() || b.date.isEmpty() || b.time.isEmpty() || b.shootType.isEmpty()) {
				sendJson(exchange, 400, "{\"error\":\"Missing required fields\"}"); return;
			}
			BOOKING_ITEMS.add(0, b);
			saveBookingsToDisk();
			sendJson(exchange, 201, "{\"status\":\"ok\"}");
		}
	}

	private static void loadDataFromDisk() {
		try {
			if (VIDEOS_DB_FILE.exists()) {
				for (String line : Files.readAllLines(VIDEOS_DB_FILE.toPath(), StandardCharsets.UTF_8)) {
					if (!line.trim().isEmpty()) { VideoItem v = VideoItem.fromRecord(line); if (v != null) VIDEO_ITEMS.add(v); }
				}
			}
			if (BOOKINGS_DB_FILE.exists()) {
				for (String line : Files.readAllLines(BOOKINGS_DB_FILE.toPath(), StandardCharsets.UTF_8)) {
					if (!line.trim().isEmpty()) { BookingItem b = BookingItem.fromRecord(line); if (b != null) BOOKING_ITEMS.add(b); }
				}
			}
		} catch (IOException e) { System.err.println("Failed to load data: " + e.getMessage()); }
	}

	private static void saveVideosToDisk() {
		synchronized (VIDEO_ITEMS) {
			List<String> out = new ArrayList<>(); for (VideoItem v : VIDEO_ITEMS) out.add(v.toRecord());
			try { Files.write(VIDEOS_DB_FILE.toPath(), out, StandardCharsets.UTF_8); } catch (IOException e) { System.err.println("Failed to save videos: " + e.getMessage()); }
		}
	}

	private static void saveBookingsToDisk() {
		synchronized (BOOKING_ITEMS) {
			List<String> out = new ArrayList<>(); for (BookingItem b : BOOKING_ITEMS) out.add(b.toRecord());
			try { Files.write(BOOKINGS_DB_FILE.toPath(), out, StandardCharsets.UTF_8); } catch (IOException e) { System.err.println("Failed to save bookings: " + e.getMessage()); }
		}
	}

	private static Map<String, String> parseWwwForm(HttpExchange exchange) throws IOException {
		String raw = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
		Map<String,String> map = new HashMap<>(); if (raw.isEmpty()) return map;
		for (String pair : raw.split("&")) {
			int i = pair.indexOf('='); String k = i>=0? pair.substring(0,i): pair; String v = i>=0? pair.substring(i+1): "";
			k = urlDecode(k); v = urlDecode(v); map.put(k, v);
		}
		return map;
	}

	private static String urlDecode(String s) {
		try { return URLDecoder.decode(s, StandardCharsets.UTF_8.name()); } catch (UnsupportedEncodingException e) { return s; }
	}

	private static void sendText(HttpExchange ex, int status, String text) throws IOException {
		byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
		ex.sendResponseHeaders(status, bytes.length);
		try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
	}

	private static void sendHtml(HttpExchange ex, int status, String html) throws IOException {
		byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
		ex.sendResponseHeaders(status, bytes.length);
		try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
	}

	private static void sendJson(HttpExchange ex, int status, String json) throws IOException {
		byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		ex.sendResponseHeaders(status, bytes.length);
		try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
	}

	private static String ns(String s) { return s==null? "" : s; }

	private static String escapeJson(String s) {
		if (s == null) return "";
		StringBuilder out = new StringBuilder();
		for (int i=0;i<s.length();i++) {
			char c = s.charAt(i);
			switch (c) {
				case '"': out.append("\\\""); break;
				case '\\': out.append("\\\\"); break;
				case '\b': out.append("\\b"); break;
				case '\f': out.append("\\f"); break;
				case '\n': out.append("\\n"); break;
				case '\r': out.append("\\r"); break;
				case '\t': out.append("\\t"); break;
				default: if (c < 0x20) out.append(String.format(Locale.ROOT, "\\u%04x", (int)c)); else out.append(c);
			}
		}
		return out.toString();
	}

	private static String videoToJson(VideoItem v) {
		return "{" +
			"\"id\":\""+escapeJson(v.id)+"\","+
			"\"title\":\""+escapeJson(v.title)+"\","+
			"\"videoUrl\":\""+escapeJson(v.videoUrl)+"\","+
			"\"thumbnailUrl\":\""+escapeJson(v.thumbnailUrl)+"\","+
			"\"createdAt\":\""+escapeJson(v.createdAt)+"\""+
		"}";
	}

	private static String videosToJson() {
		StringBuilder sb = new StringBuilder(); sb.append('[');
		boolean first = true; synchronized (VIDEO_ITEMS) {
			for (VideoItem v : VIDEO_ITEMS) { if (!first) sb.append(','); first=false; sb.append(videoToJson(v)); }
		}
		sb.append(']'); return sb.toString();
	}

	private static String getIndexHtml() {
		StringBuilder sb = new StringBuilder();
		sb.append("<!doctype html><html lang='en'><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width, initial-scale=1'/><title>Video Editor Portfolio & Booking</title>");
		sb.append("<style>");
		sb.append("*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial;color:#e5e7eb;background:#0b1220}");
		sb.append("header{position:sticky;top:0;z-index:10;background:#0f172a;border-bottom:1px solid rgba(255,255,255,.06)}");
		sb.append(".container{max-width:1100px;margin:0 auto;padding:20px}h1{margin:8px 0 4px;color:#e2e8f0;font-size:28px}p.sub{margin:0 0 12px;color:#94a3b8}");
		sb.append(".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-top:16px}");
		sb.append(".card{background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden}");
		sb.append(".thumb{width:100%;height:150px;object-fit:cover;background:#111827}.card-body{padding:12px}.title{color:#e5e7eb;font-weight:600;font-size:14px;margin:0 0 6px}.meta{color:#94a3b8;font-size:12px}.actions{display:flex;gap:10px;margin-top:10px}.btn{cursor:pointer;border:none;border-radius:8px;padding:8px 10px;font-weight:600}.btn.primary{background:#22c55e;color:#05160c}.btn.danger{background:#ef4444;color:#fff}");
		sb.append(".admin{margin-top:24px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#0b1220}");
		sb.append(".row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}input,select,textarea{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#0b1220;color:#e5e7eb}textarea{min-height:80px}label{color:#cbd5e1;font-size:12px;margin-bottom:6px;display:block}.field{margin-bottom:12px}.divider{height:1px;background:rgba(255,255,255,.12);margin:16px 0}");
		sb.append(".toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#0b1220;border:1px solid rgba(255,255,255,.12);color:#e5e7eb;padding:10px 14px;border-radius:10px;display:none}");
		sb.append(".modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:20px}.modal .modal-card{width:min(900px,100%);background:#0b1220;border:1px solid rgba(255,255,255,.1);border-radius:12px;overflow:hidden}.modal header{position:static;background:#0f172a;border-bottom:1px solid rgba(255,255,255,.1)}.modal header .container{padding:12px 16px}.modal .content{padding:16px}.close{cursor:pointer;color:#e5e7eb;background:transparent;border:none;font-size:16px}");
		sb.append("</style></head><body>");
		sb.append("<header><div class='container hero'><div><h1>Freelance Video Editor</h1><p class='sub'>Portfolio, client references, and easy booking.</p></div><div class='cta'><button class='btn primary' onclick='openBooking()'>Book a Shoot</button><span class='badge'>Available</span></div></div></header>");
		sb.append("<main class='container'><section id='portfolio'><div class='grid' id='grid'></div></section>");
		sb.append("<div class='admin'><h3>Manage Portfolio</h3><div class='row'><div class='field'><label>Title</label><input id='title' placeholder='Amazing Wedding Highlight'/></div><div class='field'><label>Video URL (mp4/YouTube/Vimeo)</label><input id='videoUrl' placeholder='https://...'/></div></div><div class='row'><div class='field'><label>Thumbnail URL (optional)</label><input id='thumbnailUrl' placeholder='https://...jpg'/></div><div class='field'><label>&nbsp;</label><button class='btn primary' onclick='addVideo()'>Add to Portfolio</button></div></div></div>");
		sb.append("<div class='divider'></div><section id='booking'><h3 style='color:#e2e8f0;margin:0 0 12px'>Quick Booking</h3>");
		sb.append("<div class='row3'><div class='field'><label>Full Name</label><input id='b_fullName' placeholder='John Doe'/></div><div class='field'><label>Email</label><input id='b_email' placeholder='john@example.com'/></div><div class='field'><label>Phone</label><input id='b_phone' placeholder='+1 555 123 4567'/></div></div>");
		sb.append("<div class='row3'><div class='field'><label>Date</label><input type='date' id='b_date'/></div><div class='field'><label>Time</label><input type='time' id='b_time'/></div><div class='field'><label>Duration (hours)</label><input type='number' min='1' id='b_duration' placeholder='4'/></div></div>");
		sb.append("<div class='row3'><div class='field'><label>Type of Shoot</label><select id='b_shootType'><option value=''>Select Type</option><option>Wedding</option><option>Corporate</option><option>Music Video</option><option>Event</option><option>Commercial</option><option>Other</option></select></div><div class='field'><label>Event Type</label><input id='b_eventType' placeholder='Reception, Product Launch, etc.'/></div><div class='field'><label>Budget (optional)</label><input id='b_budget' placeholder='e.g., 1200 USD'/></div></div>");
		sb.append("<div class='row'><div class='field'><label>Location</label><input id='b_location' placeholder='City, venue, address'/></div><div class='field'><label>Notes</label><textarea id='b_notes' placeholder='Any details, references, or requests'></textarea></div></div>");
		sb.append("<button class='btn primary' onclick='submitBooking()'>Request Booking</button></section></main>");
		sb.append("<div id='toast' class='toast'></div><div id='videoModal' class='modal'><div class='modal-card'><header><div class='container' style='display:flex;align-items:center;gap:10px'><h3 style='color:#e2e8f0;margin:0;font-size:16px'>Preview</h3><button class='close' onclick='closeModal()'>✕</button></div></header><div class='content' id='modalContent'></div></div></div>");
		sb.append("<script>");
		sb.append("var grid=document.getElementById('grid');var toast=document.getElementById('toast');var videoModal=document.getElementById('videoModal');var modalContent=document.getElementById('modalContent');");
		sb.append("function showToast(msg){toast.textContent=msg;toast.style.display='block';setTimeout(function(){toast.style.display='none'},2600)}");
		sb.append("function openBooking(){document.getElementById('b_fullName').scrollIntoView({behavior:'smooth',block:'center'})}");
		sb.append("function openModal(html){modalContent.innerHTML=html;videoModal.style.display='flex'}function closeModal(){videoModal.style.display='none';modalContent.innerHTML=''}");
		sb.append("function render(){fetch('/api/videos').then(function(r){return r.json()}).then(function(items){grid.innerHTML='';if(!Array.isArray(items))return;items.forEach(function(v){var card=document.createElement('div');card.className='card';var thumb;if(v.thumbnailUrl){thumb=document.createElement('img');thumb.className='thumb';thumb.src=v.thumbnailUrl;thumb.alt=v.title;}else{thumb=document.createElement('div');thumb.className='thumb';thumb.style.display='flex';thumb.style.alignItems='center';thumb.style.justifyContent='center';thumb.style.color='#94a3b8';thumb.textContent='No Thumbnail';}var body=document.createElement('div');body.className='card-body';var p=document.createElement('p');p.className='title';p.textContent=v.title;var meta=document.createElement('div');meta.className='meta';meta.textContent='Added '+new Date(v.createdAt).toLocaleString();var actions=document.createElement('div');actions.className='actions';var view=document.createElement('button');view.className='btn';view.textContent='View';view.onclick=function(){viewVideo(v.videoUrl)};var del=document.createElement('button');del.className='btn danger';del.textContent='Delete';del.onclick=function(){deleteVideo(v.id)};actions.appendChild(view);actions.appendChild(del);body.appendChild(p);body.appendChild(meta);body.appendChild(actions);card.appendChild(thumb);card.appendChild(body);grid.appendChild(card);});}).catch(function(){})}");
		sb.append("function addVideo(){var title=document.getElementById('title').value.trim();var videoUrl=document.getElementById('videoUrl').value.trim();var thumbnailUrl=document.getElementById('thumbnailUrl').value.trim();if(!title||!videoUrl){showToast('Please provide title and video URL');return;}var body=new URLSearchParams({title:title,videoUrl:videoUrl,thumbnailUrl:thumbnailUrl}).toString();fetch('/api/videos',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body}).then(function(r){if(!r.ok)throw new Error();return r.json()}).then(function(){showToast('Added to portfolio');document.getElementById('title').value='';document.getElementById('videoUrl').value='';document.getElementById('thumbnailUrl').value='';render()}).catch(function(){showToast('Failed to add')})}");
		sb.append("function deleteVideo(id){if(!confirm('Delete this item?'))return;fetch('/api/videos/'+encodeURIComponent(id),{method:'DELETE'}).then(function(r){if(!r.ok)throw new Error();return r.json()}).then(function(){showToast('Deleted');render()}).catch(function(){showToast('Failed to delete')})}");
		sb.append("function viewVideo(url){if(url&&url.toLowerCase().indexOf('.mp4')>=0){openModal('<video controls style=\\\"width:100%\\\"><source src=\\\"'+url+'\\\" type=\\\"video/mp4\\\"></video>')}else{window.open(url,'_blank')}}");
		sb.append("function submitBooking(){var fullName=document.getElementById('b_fullName').value.trim();var email=document.getElementById('b_email').value.trim();var phone=document.getElementById('b_phone').value.trim();var date=document.getElementById('b_date').value;var time=document.getElementById('b_time').value;var durationHours=document.getElementById('b_duration').value;var shootType=document.getElementById('b_shootType').value;var eventType=document.getElementById('b_eventType').value.trim();var location=document.getElementById('b_location').value.trim();var budget=document.getElementById('b_budget').value.trim();var notes=document.getElementById('b_notes').value.trim();if(!fullName||!email||!date||!time||!shootType){showToast('Please fill required fields');return;}var body=new URLSearchParams({fullName:fullName,email:email,phone:phone,date:date,time:time,durationHours:durationHours,shootType:shootType,eventType:eventType,location:location,budget:budget,notes:notes}).toString();fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body}).then(function(r){if(!r.ok)throw new Error();return r.json()}).then(function(){showToast('Booking request sent!');['b_fullName','b_email','b_phone','b_date','b_time','b_duration','b_shootType','b_eventType','b_location','b_budget','b_notes'].forEach(function(id){document.getElementById(id).value=''})}).catch(function(){showToast('Failed to submit booking')})}");
		sb.append("render();</script></body></html>");
		return sb.toString();
	}
}

