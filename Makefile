all : build/icon.icns build/icon.ico

# Mac icons (this build tool is only on Mac)
build/icon.icns : build/blackbox.iconset/*
	iconutil -c icns build/blackbox.iconset --output build/icon.icns

build/icon.ico : build/blackbox.iconset/*
	node_modules/.bin/to-ico build/blackbox.iconset/icon_16x16.png build/blackbox.iconset/icon_32x32.png build/blackbox.iconset/icon_64x64.png \
	       build/blackbox.iconset/icon_128x128.png build/blackbox.iconset/icon_256x256.png > build/icon.ico

clean :

