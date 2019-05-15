
$(document).ready(function() {
  // set up slide carousel
  var carousel = $(".image-carousel");

  $(".image-carousel").on("init", function() { 
    carousel.fadeIn("slow");
  });

  carousel.slick({ infinite: true, autoplay: true, autoplaySpeed: 2500, fade: true });

});