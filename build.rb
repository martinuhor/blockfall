#!/usr/bin/env ruby
# Compiles the pitch deck and copies the game into dist/.
# Cloudflare Pages runs this at build time. The published site is static.

require "erb"
require "fileutils"

Encoding.default_external = Encoding::UTF_8

root = __dir__
dist = File.join(root, "dist")
views = File.join(root, "views")

def read_utf8(path)
  File.read(path, mode: "r:UTF-8")
end

FileUtils.rm_rf(dist)
FileUtils.mkdir_p(dist)

%w[index.html ost.html room.html about.html studio.html 404.html robots.txt sitemap.xml _headers manifest.webmanifest].each do |name|
  src = File.join(root, name)
  FileUtils.cp(src, File.join(dist, name)) if File.file?(src)
end

FileUtils.cp_r(File.join(root, "css"), File.join(dist, "css"))
FileUtils.cp_r(File.join(root, "js"), File.join(dist, "js"))
FileUtils.cp_r(File.join(root, "audio"), dist)

merch_dir = File.join(root, "merch")
FileUtils.cp_r(merch_dir, File.join(dist, "merch")) if File.directory?(merch_dir)

video_dir = File.join(root, "video")
FileUtils.mkdir_p(File.join(dist, "video"))
Dir.glob(File.join(video_dir, "*.mp4")).each do |file|
  FileUtils.cp(file, File.join(dist, "video", File.basename(file)))
end

title = "Blockfall — pitch"
content = ERB.new(read_utf8(File.join(views, "deck.html.erb")), trim_mode: "-").result(binding)
content = content.encode(Encoding::UTF_8)
html = ERB.new(read_utf8(File.join(views, "layout.html.erb")), trim_mode: "-").result(binding)
File.write(File.join(dist, "deck.html"), html)
puts "Built #{dist}"
